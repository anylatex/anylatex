const { ipcRenderer } = require('electron')
const remote = require('electron').remote
const path = require('path')
const { Converter } = require(path.resolve(__dirname, 'js/converter.js'))
const crypto = require('crypto')
const async = require('async')
const superagent = require('superagent')
const Split = require('split.js')
const store = remote.getGlobal('store')

const apiBase = store.getConfig('apiBase')
const agent = superagent.agent().timeout({ response: 20000 })

/* Setup current document's name and id */
const documentID = remote.getGlobal('currentDocumentID')
const documentName = remote.getGlobal('currentDocumentName')
document.title = 'Editor - ' + documentName

/* Setup custom scrollbars */
var editorScrollBar
$(function () {
    editorScrollBar = $(".editor").niceScroll({
        grabcursorenabled: false
    })
})

    /* Split panels, update tree's pinned status */
    ; (function () {
        const { stat } = store.getOneDocumentData(documentID)
        var pinTree = stat['pinTree']
        // tree is pinned by default in html.
        // so, here will only need to detect if tree is unpinned
        if (pinTree === false) {
            var pinTreeButton = $('#pin-tree-panel')
            var treePanel = $('#tree-panel')
            pinTreeButton.removeClass('pinned')
            // change the icon's style
            $('#pin-icon').removeClass('pinned')
            // unpin the panel
            treePanel.removeClass('pinned')
            // hide the tree
            if (!treePanel.hasClass('hide')) treePanel.addClass('hide')
        }
        var storedSizes = stat['splitSizes']
        var sizes
        if (storedSizes) {
            sizes = JSON.parse(storedSizes)
        } else {
            // TODO: why total is not 100?
            sizes = [40, 40]
        }
        Split(['#content-panel', '#pdf-panel'], {
            elementStyle: function (dimension, size, gutterSize) {
                return { 'flex-basis': 'calc(' + size + '% - ' + gutterSize + 'px)' }
            },
            sizes: sizes,
            minSize: [650, 350],
            gutterSize: 3,
            onDrag: () => {
                editorScrollBar.resize()
            },
            onDragEnd: endSizes => {
                store.updateDocument({ id: documentID, splitSizes: endSizes })
            }
        })
    }())

/* Tool Functions */
var editorRange = ''
// Credit Raab at https://stackoverflow.com/a/11077016
function insertTextAtCaret(field, text) {
    if (field.selectionStart || field.selectionStart == '0') {
        var startPos = field.selectionStart;
        var endPos = field.selectionEnd;
        field.value = field.value.substring(0, startPos)
            + text
            + field.value.substring(endPos, field.value.length);
    } else {
        field.value += text;
    }
}
// Credit: Tim Down at https://stackoverflow.com/a/6691294
function insertElementAtCaret(html) {
    const range = editorRange
    range.deleteContents();

    var el = document.createElement("div");
    el.innerHTML = html;
    var frag = document.createDocumentFragment(), node;
    while ((node = el.firstChild)) {
        frag.appendChild(node);
    }
    range.insertNode(frag);
    // force saving
    save(null, true)
    // trigger content change event
    editorContentChangeHandler(null)
}

/* Get Available Templates */
// Templates Arguments
let templateArgs = store.getConfig('templateArgs')
let defaultTemplateName = store.getConfig('defaultTemplateName')
setupTemplatesDropdown()

function setupTemplatesDropdown() {
    let templateNames = Object.keys(templateArgs)
    let dropdownElement = document.getElementById('templates-dropdown')
    for (let i = 0; i < templateNames.length; i++) {
        let templateName = templateNames[i]
        let dropdownItem = document.createElement('a')
        dropdownItem.className = 'dropdown-item'
        dropdownItem.setAttribute('href', '#')
        dropdownItem.setAttribute('id', templateName)
        dropdownItem.innerText = templateName
        dropdownElement.appendChild(dropdownItem)
    }
}

/* Load the document's content */
var compiledHtml = ''
    ; (function () {
        let { documentContent, stat, pdfExists } = store.getOneDocumentData(documentID)
        // recover document's content
        if (documentContent) {
            document.getElementById('editor').innerHTML = documentContent
            // enable popovers
            $(function () {
                $('[data-toggle="popover"]').popover()
            })
        }
        // recover template setting and arguments' content
        let { template, args, partArguments } = stat
        if (!template) {
            template = defaultTemplateName
        }
        document.getElementById('current-template').value = template
        document.getElementById('dropdown-button').innerText = `Templates(${template})`
        setTemplateHeadings(template)
        setTemplateArguments(template)
        if (templateArgs[template]['partArgs']) {
            const templatePartArgNames = Object.keys(templateArgs[template]['partArgs'])
            for (const argName of Object.keys(partArguments)) {
                if (templatePartArgNames.indexOf(argName) < 0) continue
                const argValue = partArguments[argName]
                document.getElementById(argName + '-' + 'value').setAttribute('value', argValue)
            }
        }
        if (templateArgs[template]['args']) {
            let argNames = Object.keys(args)
            let templateArgNames = Object.keys(templateArgs[template]['args'])
            for (const argName of argNames) {
                if (templateArgNames.indexOf(argName) < 0) continue
                const value = args[argName]
                let argElement = document.getElementById(argName)
                argElement.value = value
            }
        }

        // generate outline tree
        generateOutline()

        // Load compiled PDF
        if (pdfExists != false) {
            // TODO: check if content in editor corresponding to the existed pdf
            compiledHtml = document.getElementById('editor').innerHTML
            ipcRenderer.send('alert', 'load existed pdf: ' + pdfExists)
            ipcRenderer.send('set-variable', { name: 'isCompileFinish', value: true })
            ipcRenderer.send('set-variable', { name: 'pdfPath', value: pdfExists })
        }

    })()

// cancel loading animation
setTimeout(() => {
    document.getElementById('page-loader-container').classList.add('d-none')
}, 800)


/* Modal handlers */
//$('.modal').on('show.bs.modal', function (e) {
//    document.getElementById('navbar').classList.remove('fixed-top')
//})
//$('.modal').on('hidden.bs.modal', function (e) {
//    document.getElementById('navbar').classList.add('fixed-top')
//})


/* Reference Modal */

// listener for changes in reference editor
$('#reference-editor').on('input', () => {
    let re = /@.*?\{(.*?),.*?\}\s}/gs
    var bibtexText = document.getElementById('reference-editor').innerText
    var extractedLabels = []
    try {
        var result = re.exec(bibtexText)
        while (result) {
            let label = result[1].trim()
            if (extractedLabels.indexOf(label) < 0) {
                extractedLabels.push(label)
            }
            result = re.exec(bibtexText)
        }
    } catch (err) { }
    document.getElementById('extracted-labels').innerText = extractedLabels.join(', ')
})

// insert reference
$('#reference-modal').on('hidden.bs.modal', () => {
    let labelEl = document.getElementById('extracted-labels')
    let labelText = labelEl.innerText
    if (!labelText) {
        alert('No labels extracted. No reference will be inserted.')
        document.getElementById('reference-editor').innerHTML = ''
        labelEl.innerHTML = ''
        return
    }
    let bibtexText = document.getElementById('reference-editor').innerText

    const referenceData = {
        referenceLabel: labelText,
        title: labelText,
        content: bibtexText,
        cite: true,
        sup: document.getElementById('reference-sup-check').checked,
        icon: '<i class="far fa-file-alt"></i>',
        bibtexText: bibtexText
    }
    const reference = getReferenceHTMLElement(referenceData)
    insertElementAtCaret(reference.outerHTML)
    // clear reference editor
    document.getElementById('reference-editor').innerHTML = ''
    labelEl.innerHTML = ''
})

/* Image Choosing Modal */

$('#open-image-selector').on('click', () => {
    // clear
    document.getElementById('choose-image').value = ''
    document.getElementById('choose-image-name').innerHTML = ''
    document.getElementById('show-choose-image').src = ''
})

$('#choose-image').on('change', () => {
    let file = document.getElementById('choose-image').files[0]
    let fileName = file.name
    document.getElementById('choose-image-name').innerHTML = fileName
    let reads = new FileReader()
    reads.readAsDataURL(file)
    reads.onload = function (e) {
        document.getElementById('show-choose-image').src = this.result
    }
})

function decodeImageFromBase64(source, binaryData = true, hash = true) {
    let matches = source.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
    let image = {}
    image.type = matches[1].split('/')[1]
    if (binaryData) {
        image.data = Buffer.from(matches[2], 'base64')
    } else {
        image.data = matches[2]
    }
    if (hash) {
        image.hash = crypto.createHash('sha256').update(image.data.toString('binary')).digest('hex')
    }
    return image
}

// clear `pending` status
(function () {
    for (const img of document.getElementsByClassName('inserted-image')) {
        if (img.getAttribute('upload') == 'pending') {
            img.setAttribute('upload', 'no')
        }
    }
})()
setInterval(detectUnuploadedImages, 10000)

function detectUnuploadedImages() {
    for (const el of document.getElementsByClassName('inserted-image')) {
        let upload = el.getAttribute('upload')
        if (upload == 'false') {
            checkAndUploadImage(el)
        }
    }
}

function checkAndUploadImage(imgEl, resolve, reject) {
    async.waterfall([
        // check if the image existed on the server
        (cb) => {
            if (imgEl.getAttribute('upload') == 'true') {
                // image already uploaded to the server
                // raise error to avoid following callings
                cb(true, true, `image ${imgEl.getAttribute('id')} already uploaded`)
            }
            imgEl.setAttribute('upload', 'pending')
            agent
                .get(`${apiBase}/images/${imgEl.getAttribute('id')}?check=true&user_id=${remote.getGlobal('userID')}`)
                .ok(res => res.status == '200')
                .then(res => {
                    // images exists on the server
                    imgEl.setAttribute('upload', 'true')
                    // raise error to avoid next call
                    cb(true, true, `Image ${imgEl.getAttribute('id')} exists on the server.`)
                })
                .catch(err => {
                    if (err && err.status == '404') {
                        // not exist on the server
                        // not raise error to continue the next call which will upload the image
                        cb(null, imgEl)
                    } else {
                        // unknow error
                        imgEl.setAttribute('upload', 'false')
                        // raise unknown error
                        cb(true, undefined, `WARN: unknown error when querying image's status:\n\t${err}`)
                    }
                })
        },
        // upload the image
        (imgEl, cb) => {
            ipcRenderer.send('alert', `Start uploading image ${imgEl.getAttribute('id')}...`)
            const img = decodeImageFromBase64(imgEl.getAttribute('src'), false, false)
            const body = {
                'user_id': remote.getGlobal('userID'),
                'image_id': imgEl.getAttribute('id'),
                'content': img.data
            }
            agent
                .post(`${apiBase}/images`)
                .send(body)
                .ok(res => res.status == '201')
                .then(res => {
                    ipcRenderer.send("alert", `Upload image ${imgEl.getAttribute('id')} success`)
                    imgEl.setAttribute('upload', 'true')
                    cb(null, undefined)
                })
                .catch(err => {
                    let errorInfo = `Upload image ${imgEl.getAttribute('id')} faild:\n\t` + err.toString()
                    imgEl.setAttribute('upload', 'false')
                    cb(true, undefined, errorInfo)
                })
        }
    ], (err, res, info) => {
        save(null, true)
        if (err) {
            ipcRenderer.send('alert', info)
            // real error
            if (!res && reject) reject(`Image ${imgEl.getAttribute('id')} upload failed`)
            // fake error
            else if (res && resolve) resolve()
        }
        else if (resolve) resolve(`Image ${imgEl.getAttribute('id')} uploaded`)
    })
}

// init interact dragging
const minimumLinewidth = 0.2
const maximumLinewidth = 1
interact('div.image-container')
    .resizable({
        // resize from all edges and corners
        edges: { left: false, right: true, bottom: true, top: false },

        preserveAspectRatio: true,

        modifiers: [
            // keep the edges inside the parent
            interact.modifiers.restrictEdges({
                outer: 'parent',
                endOnly: true,
            }),

        ],

        inertia: false
    })
    .on('resizestart', event => {
        // set original width and height
        var container = event.target
        var target = container.getElementsByTagName('img')[0]
        var originWidth = parseFloat(target.getAttribute('origin-width')) || 0,
            originHeight = parseFloat(target.getAttribute('origin-height')) || 0
        if (!originWidth) target.setAttribute('origin-width', event.rect.width)
        if (!originHeight) target.setAttribute('origin-height', event.rect.height)
        // show image size
        document.getElementById(target.getAttribute('popid') + 'size').classList.remove('d-none')
        // disable the popover
        $(`[popid='${target.getAttribute('popid')}'`).popover('hide')
        $(`[popid='${target.getAttribute('popid')}'`).popover('disable')
        // disable select
        document.getElementById('editor').classList.add('disable-select')
        document.getElementById('editor').setAttribute('contenteditable', 'false')
    })
    .on('resizemove', event => {
        var container = event.target
        var target = container.getElementsByTagName('img')[0]
        var x = (parseFloat(target.getAttribute('data-x')) || 0),
            y = (parseFloat(target.getAttribute('data-y')) || 0)

        var originWidth = parseFloat(target.getAttribute('origin-width'))
        var deltaWidth = originWidth - event.rect.width
        var curLineWidth = parseFloat(target.getAttribute('default-linewidth')) - (deltaWidth / originWidth)
        curLineWidth = Math.floor(curLineWidth * 100) / 100
        if (curLineWidth < minimumLinewidth || curLineWidth > maximumLinewidth) {
            return
        }
        target.setAttribute('linewidth', curLineWidth)
        document.getElementById(target.getAttribute('popid') + 'size').innerText = `Image Width = ${curLineWidth} line width`
        // update the element's style
        target.style.width = event.rect.width + 'px'
        target.style.height = event.rect.height + 'px'

        target.setAttribute('data-x', x)
        target.setAttribute('data-y', y)
    })
    .on('resizeend', event => {
        var container = event.target
        var target = container.getElementsByTagName('img')[0]
        // hide image's size text
        document.getElementById(target.getAttribute('popid') + 'size').classList.add('d-none')
        // enable the popover
        target.setAttribute('data-content', target.getAttribute('caption') + ' | ' + target.getAttribute('linewidth') + ' line width')
        $(`[popid='${target.getAttribute('popid')}'`).popover('enable')
        document.getElementById('editor').classList.remove('disable-select')
        document.getElementById('editor').setAttribute('contenteditable', 'true')
    })

$('#image-confirm').on('click', () => {
    let imgSource = document.getElementById('show-choose-image').src
    let image = decodeImageFromBase64(imgSource)

    // store to the local directory
    image.name = image.hash + '.' + image.type
    store.updateDocument({ id: documentID, image: image })

    // insert into the editor
    let div = document.createElement('div')
    div.classList.add('mb-3')
    let container = document.createElement('div')
    container.classList.add('image-container')
    container.setAttribute('contenteditable', 'false')
    let imgSize = document.createElement('imgsizehint')
    imgSize.classList.add('d-none')
    imgSize.classList.add('text-muted')
    imgSize.classList.add('small')
    imgSize.classList.add('font-weight-bold')
    let img = document.createElement('img')
    img.classList.add('img-fluid')
    img.classList.add('inserted-image')
    img.setAttribute('id', image.hash)
    img.setAttribute('format', image.type)
    img.setAttribute('src', imgSource)
    img.setAttribute('upload', 'false')
    let captionText = document.getElementById('image-caption').value
    if (captionText) {
        img.setAttribute('caption', captionText)
    } else {
        img.setAttribute('caption', '')
        captionText = 'No Caption'
    }
    // set up initial width ratio
    var defaultLinewidth = 0.6
    img.setAttribute('default-linewidth', defaultLinewidth)
    img.setAttribute('linewidth', defaultLinewidth)
    // set up width and height
    var containerWidth = editor.offsetWidth * 0.85
    var imgAspectRatio = img.naturalWidth / img.naturalHeight
    var displayWidth = containerWidth * defaultLinewidth
    var displayHeight = displayWidth / imgAspectRatio
    img.width = displayWidth
    img.height = displayHeight
    // center the image
    div.style.textAlign = 'center'
    // set up popover and enable it
    img.setAttribute('data-toggle', 'popover')
    img.setAttribute('title', 'Caption')
    img.setAttribute('data-content', `${captionText} | ${defaultLinewidth} line width`)
    img.setAttribute('data-trigger', 'hover')
    img.setAttribute('data-placement', 'top')
    let popID = Math.random().toString(36).substr(2, 9)
    img.setAttribute('popid', popID)
    imgSize.setAttribute('id', popID + 'size')
    $(function () {
        $(`[popid='${popID}'`).popover()
    })
    // bind selecting function
    container.appendChild(img)
    container.appendChild(document.createElement('br'))
    container.appendChild(imgSize)
    div.appendChild(container)
    insertElementAtCaret(div.outerHTML)
    ipcRenderer.send('alert', 'inserted ' + image.name)
})

/* Table inserting modal */

for (const table of document.getElementsByClassName('table-container')) {
    table.addEventListener('click', tableClick)
}
document.getElementById('table-confirm').addEventListener('click', tableConfirm)

$('#open-table-selector').on('click', () => {
    // clear
    document.getElementById('table-caption').value = ''
})

function tableClick(event) {
    const target = event.target
    if (target.classList.contains('block-highlight')) {
        target.classList.remove('block-highlight')
    } else {
        // remove other tables' hightlight style
        const tables = document.getElementsByClassName('table-container')
        for (const table of tables) {
            if (table === target) continue
            if (table.classList.contains('block-highlight')) {
                table.classList.remove('block-highlight')
            }
        }
        target.classList.add('block-highlight')
    }
}

function tableConfirm(event) {
    const selectedContainer = document.querySelectorAll('.block-highlight.table-container')[0]
    if (!selectedContainer) {
        alert('No table style selected.')
        return
    }
    const selectedTable = selectedContainer.getElementsByTagName('table')[0]
    const tableStyle = selectedTable.id
    const tableRowNumber = parseInt(
        document.getElementById('table-row-number').value || document.getElementById('table-row-number').placeholder)
    const tableColNumber = parseInt(
        document.getElementById('table-col-number').value || document.getElementById('table-col-number').placeholder)

    // create the table
    var frame, rules
    if (tableStyle == 'all-table') {
        frame = 'box'
        rules = 'all'
    } else if (tableStyle == 'lrm-table') {
        frame = 'hsides'
        rules = 'all'
    } else {
        alert('Unknow table style: ' + tableStyle)
        return
    }
    const tableCaption = document.getElementById('table-caption').value || 'No Caption'
    const tablePopID = Math.random().toString(36).substr(2, 9)
    const tableID = Math.random().toString(36).substr(2, 9)
    var tableAttributes = `id=${tableID} ` + `frame=${frame} ` + `rules=${rules} `
        + `row=${tableRowNumber} ` + `col=${tableColNumber} `
        + 'data-toggle=popover ' + 'title=Caption '
        + `data-content='${tableCaption}' ` + 'data-trigger=hover '
        + `data-placement=top ` + `popid=${tablePopID} `
    if (tableCaption != 'No Caption') tableAttributes += `caption=${tableCaption}`
    let html = [`<table style="margin: 0px auto;" ${tableAttributes}`]
    let colInRow = ''
    html.push('<tr>')
    for (let i = 0; i < tableColNumber; i++) {
        html.push('<th></th>')
        colInRow += '<td></td>'
    }
    html.push('</tr>')
    for (let i = 0; i < tableRowNumber - 1; i++) {
        html.push(`<tr>${colInRow}</tr>`)
    }
    html.push('</table>')

    // insert the table and enable popover
    const htmlString = html.join('\n')
    insertElementAtCaret(htmlString)
    $(function () {
        $(`[popid='${tablePopID}']`).popover()
    })
    ipcRenderer.send('alert', 'inserted a table')
}

/* Equation input modal */

var mathInputField = document.getElementById('math-field');
var latexSpan = document.getElementById('latex');
$(mathInputField).on('paste keyup input', renderInputFieldMath)
for (const equation of document.getElementsByClassName('equation-container')) {
    equation.addEventListener('click', equationClick)
}
document.getElementById('equation-confirm').addEventListener('click', equationConfirm)
document.getElementById('math-button-panel').addEventListener('click', insertMathSymbol)

$('#open-equation-selector').on('click', () => {
    // clear
    mathInputField.value = ''
    document.getElementById('rendered-input-equation').innerHTML = ''
    latexSpan.innerText = ''
})

function renderMath(latexInput, element) {
    try {
        katex.render(latexInput, element, {
            throwOnError: true
        })
    } catch (e) {
        console.log(e)
    }
}

// render example equations
const inlineEqExample = document.getElementById('example-inline-equation')
renderMath(AMTparseAMtoTeX(inlineEqExample.innerText), inlineEqExample)
const numberedEqExample = document.getElementById('example-display-numbered-equation')
renderMath(AMTparseAMtoTeX(numberedEqExample.innerText), numberedEqExample)
const unnumberedEqExample = document.getElementById('example-display-unnumbered-equation')
renderMath(AMTparseAMtoTeX(unnumberedEqExample.innerText), unnumberedEqExample)
// render example use cases
for (const example of document.getElementsByClassName('asciimath-example')) {
    const displayElement = document.getElementById(`render-${example.id}`)
    renderMath(AMTparseAMtoTeX(example.innerText), displayElement)
}
// render math buttons
for (const button of document.getElementsByClassName('math-buttons')) {
    const am = button.getAttribute('title')
    renderMath(AMTparseAMtoTeX(am), button)
}

function insertMathSymbol(event) {
    const target = event.target
    const amCommand = target.getAttribute('title')
    insertTextAtCaret(mathInputField, amCommand)
    renderInputFieldMath(null)
}

function renderInputFieldMath(event) {
    // convert to LaTeX
    const input = $(mathInputField).val()
    const latex = AMTparseAMtoTeX(input)
    latexSpan.innerText = latex
    // render the equation
    renderMath(latex, document.getElementById('rendered-input-equation'))
}

function equationClick(event) {
    const target = event.target
    if (target.classList.contains('block-highlight')) {
        target.classList.remove('block-highlight')
    } else {
        // remove other equations' hightlight style
        const equations = document.getElementsByClassName('equation-container')
        for (const eq of equations) {
            if (eq === target) continue
            if (eq.classList.contains('block-highlight')) {
                eq.classList.remove('block-highlight')
            }
        }
        target.classList.add('block-highlight')
    }
}

function equationConfirm(event) {
    const equationStyleBlock = document.querySelectorAll('.block-highlight.equation-container')[0]
    if (!equationStyleBlock) {
        alert('No equation style selected.')
        return
    }
    const equationStyle = equationStyleBlock.getAttribute('eq-style')
    const latexEquation = latexSpan.textContent
    let equationSpan = document.createElement('span')
    let equation = document.createElement('equation')
    const equationID = Math.random().toString(36).substr(2, 9)
    equation.innerText = latexEquation
    equation.id = equationID
    equation.setAttribute('latex', latexEquation)
    equation.setAttribute('eq-style', equationStyle)
    equationSpan.appendChild(equation)
    equationSpan.setAttribute('contenteditable', 'false')
    if (equationStyle == 'inline') {
        insertElementAtCaret(equationSpan.outerHTML + '<span></span>')
    } else {
        if (equationStyle == 'display-numbered') {
            equationSpan.innerHTML += '<equation-extra>&emsp;&emsp;&emsp;&emsp;(*)</equation-extra>'
        }
        let div = document.createElement('div')
        div.classList.add('display-equation')
        div.appendChild(equationSpan)
        insertElementAtCaret(div.outerHTML + '<br>')
    }
    katex.render(latexSpan.innerText, document.getElementById(equationID))
}

/* Insert quote modal */

for (const quote of document.getElementsByClassName('quote-container')) {
    quote.addEventListener('click', quoteClick)
}
document.getElementById('quote-confirm').addEventListener('click', quoteConfirm)

$('#open-quote-selector').on('click', () => {
    // clear
    document.getElementById('quote-text').value = ''
})

function quoteClick(event) {
    const target = event.target
    if (target.classList.contains('block-highlight')) {
        target.classList.remove('block-highlight')
    } else {
        // remove other quote' hightlight style
        const equations = document.getElementsByClassName('quote-container')
        for (const eq of equations) {
            if (eq === target) continue
            if (eq.classList.contains('block-highlight')) {
                eq.classList.remove('block-highlight')
            }
        }
        target.classList.add('block-highlight')
    }
}

function quoteConfirm(event) {
    const quoteStyleBlock = document.querySelectorAll('.block-highlight.quote-container')[0]
    if (!quoteStyleBlock) {
        alert('No quote style selected.')
        return
    }
    const quoteStyle = quoteStyleBlock.getAttribute('qt-style')
    const quoteExtra = document.createElement('quote-extra')
    const quote = document.createElement('quote')
    quoteExtra.innerText = document.getElementById(quoteStyle + '-name').innerText
    quoteExtra.appendChild(document.createElement('p'))
    quoteExtra.classList.add('text-muted')
    quote.setAttribute('qt-style', quoteStyle)
    quote.classList.add('col-10')
    quote.classList.add('p-2')
    quote.setAttribute('contenteditable', false)
    quote.style.backgroundColor = 'rgb(247, 247, 247)'
    quote.appendChild(quoteExtra)
    const quoteText = document.getElementById('quote-text').value
    for (const paragraph of quoteText.split('\n')) {
        if (!paragraph) continue
        const p = document.createElement('p')
        p.innerText = paragraph
        quote.appendChild(p)
    }
    const div = document.createElement('div')
    div.classList.add('mt-2')
    div.classList.add('mb-2')
    div.classList.add('row')
    div.classList.add('justify-content-center')
    div.appendChild(quote)
    insertElementAtCaret(div.outerHTML)
}

/* Toolbar and Editor's handlers */

// current format relating status
let controllingCommands = [
    'bold', 'italic', 'underline',
    'justifyFull', 'justifyLeft', 'justifyRight', 'justifyCenter'
]
let commandEffectsCancelKeys = {
    bold: ['Enter'],
    italic: ['Enter'],
    underline: ['Enter'],
}
let justifies = ['justifyFull', 'justifyCenter', 'justifyLeft', 'justifyRight']
var justifyStatus = 'justifyLeft'
var lastPressedKey = ''

// Basic buttons' handler
let toolbar = document.getElementById("toolbar")
toolbar.addEventListener("click", toolbarHandler)

function toolbarHandler(event) {
    var target = event.target
    var command = target.getAttribute("command")
    var value = target.getAttribute("value")
    if (!command) {
        return
    }
    ipcRenderer.sendSync("alert", "click: " + command)
    /* special commands */
    if (command == 'return') {
        save(null, true)
        ipcRenderer.send('load-page', 'documents')
        return
    }
    if (controllingCommands.indexOf(command) >= 0) {
        if (document.queryCommandState(command)) {
            // cancel command
            let button = document.querySelector(`[command="${command}"]`)
            button.classList.remove('active')
        } else {
            // new command
            let button = document.querySelector(`[command="${command}"]`)
            button.classList.add('active')
        }
    }
    if (command.startsWith('justify')) {
        justifyStatus = command
        for (let i = 0; i < justifies.length; i++) {
            let justifyCommand = justifies[i]
            if (justifyCommand == command) {
                continue
            }
            let button = document.querySelector(`[command="${justifyCommand}"]`)
            button.classList.remove('active')
        }
    }
    document.execCommand(command, false, value)
    // If inserted an heading, call outline generator
    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(value) >= 0) {
        generateOutline()
    }
}

let editor = document.getElementById('editor')
var lastSaveTime = -1
var lastSaveHtml = ''
var lastPartSaveTime = -1
editor.addEventListener('keydown', editorKeyHandler)
$('#editor').on('blur keyup paste input', editorContentChangeHandler)
$('#part-editor').on('blur keyup paste input', savePart)
editor.addEventListener('mouseover', editorHoverHandler)
document.addEventListener('selectionchange', editorSelectionHandler)
$('#editor').bind('keyup click focus', editorCursorChange)
// ctrl+s, force saving and recompiling
document.addEventListener('keydown', event => {
    if (event.ctrlKey == true && event.key == 's') {
        save(null, true)
        if (compiledHtml != editor.innerHTML) {
            compile()
        }
    }
})

// register tables and images' context menu
// first clear `context-menu-active` classes
for (const active of document.getElementsByClassName('context-menu-active')) {
    if (active.classList.contains('context-menu-active')) {
        active.classList.remove('context-menu-active')
    }
}

$.contextMenu({
    selector: 'img, table, equation, h1, h2, h3, h4, h5, h6',
    callback: function (key, options) {
        var type
        if (key === 'reference') {
            type = 'element'
        }
        else if (key === 'pageReference') {
            type = 'page'
        }
        const tagName = $(this).prop('tagName')
        // currently only support making reference of numbered elements,
        // such as images or tables with captions, numbered equations.
        // Elements with no captions but also will have numbers are not supported.
        // TODO 
        var referenceData
        if (tagName === 'IMG') {
            const caption = $(this).attr('caption')
            if (!caption) {
                alert('Can not make reference of images with no captions.')
                return
            }
            referenceData = {
                referenceLabel: $(this).attr('id'),
                title: 'Image Reference',
                content: `Reference to ${$(this).attr('caption')}`,
                cite: false,
                icon: '<i class="far fa-image"></i>'
            }
        } else if (tagName === 'TABLE') {
            const caption = $(this).attr('caption')
            if (!caption) {
                alert('Can not make reference of tables with no captions.')
                return
            }
            referenceData = {
                referenceLabel: $(this).attr('id'),
                title: 'Table Reference',
                content: `Reference to ${$(this).attr('caption')}`,
                cite: false,
                icon: '<i class="fas fa-table"></i>'
            }
        } else if (tagName === 'EQUATION') {
            const displayStyle = $(this).attr('eq-style')
            if (displayStyle != 'display-numbered') {
                alert('Can not make reference of unnumbered equations.')
                return
            }
            referenceData = {
                referenceLabel: $(this).attr('id'),
                title: 'Equation Reference',
                content: `Reference to an equation`,
                cite: false,
                icon: '<i class="fas fa-superscript"></i>'
            }
        } else if (tagName.startsWith('H')) {
            // insert id into the heading
            var headingID = $(this).attr('id')
            if (!headingID) {
                headingID = Math.random().toString(36).substr(2, 9)
                $(this).attr('id', headingID)
            }
            const content = $(this).text()
            referenceData = {
                referenceLabel: headingID,
                title: 'Heading reference',
                content: `Refernce to heading ${content}`,
                cite: false,
                icon: '<i class="fas fa-heading"></i>'
            }
        }
        const reference = getReferenceHTMLElement(referenceData, type)
        insertElementAtCaret(reference.outerHTML)
        // add the reference element's id to the referenced element
        let refEleIDs = $(this).attr('refs')
        if (!refEleIDs) {
            refEleIDs = reference.id
        } else {
            refEleIDs += `,${reference.id}`
        }
        $(this).attr('refs', refEleIDs)
    },
    items: {
        "reference": { name: "Make Reference of This", icon: "edit" },
        "pageReference": { name: "Make Reference of This Page", icon: "edit" }
    }
})

function getReferenceHTMLElement(referenceData, type) {
    const { referenceLabel, title, content, cite, sup, icon, bibtexText } = referenceData
    let reference = document.createElement('reference')
    reference.setAttribute('labels', referenceLabel)
    reference.setAttribute('contenteditable', 'false')
    // set up popover and enable it
    reference.setAttribute('data-toggle', 'popover')
    reference.setAttribute('title', title)
    reference.setAttribute('data-content', content)
    reference.setAttribute('data-trigger', 'hover')
    reference.setAttribute('data-placement', 'top')
    let id = '_' + Math.random().toString(36).substr(2, 9)
    reference.setAttribute('id', id)
    // enable popover
    $(function () {
        $('#' + id).popover()
    })
    // reference icon
    const insertedIcon = icon || '*'
    // cite or normal cross reference
    if (cite) {
        reference.classList.add('bibtex')
        reference.setAttribute('bibtex', bibtexText)
        reference.setAttribute('type', 'cite')
    } else {
        reference.setAttribute('type', 'label')
    }
    // whether refer to the page
    reference.setAttribute('ref-type', type)
    if (type === 'page') {
        reference.innerHTML = `<i class="fas fa-paragraph"></i>: ${insertedIcon}`
        reference.innerHTML = `<i class="fas fa-chevron-left"></i>${reference.innerHTML}<i class="fas fa-chevron-right"></i>`
        reference.setAttribute('title', 'Page Referencing')
    } else {
        reference.innerHTML = `<i class="fas fa-chevron-left"></i>${insertedIcon}<i class="fas fa-chevron-right"></i>`
    }
    // whether sup
    if (cite && sup) {
        reference.setAttribute('sup', true)
        reference.innerHTML = `<sup>${reference.innerHTML}</sup>`
    }
    // return html element
    return reference
}

function save(event, force = false) {
    if (Date.now() - lastSaveTime < 2000 && !force) {
        return
    }
    if (editor.innerHTML == lastSaveHtml && !force) {
        return
    }
    const startTime = Date.now()
    document.getElementById('save-hint').classList.add('d-none')
    document.getElementById('save-loader').classList.remove('d-none')
    document.getElementById('save-button').title = 'saving'
    const content = document.getElementById('editor').innerHTML
    store.updateDocument({
        id: documentID,
        htmlContent: content
    })
    if (Date.now() - startTime < 500) {
        setTimeout(() => {
            document.getElementById('save-hint').classList.remove('d-none')
            document.getElementById('save-loader').classList.add('d-none')
            document.getElementById('save-button').title = 'saved'
        }, 1000)
    } else {
        document.getElementById('save-hint').classList.remove('d-none')
        document.getElementById('save-loader').classList.add('d-none')
        document.getElementById('save-button').title = 'saved'
    }
    lastSaveTime = Date.now()
    lastSaveHtml = editor.innerHTML
}

function savePart(event, force = false) {
    if (Date.now() - lastPartSaveTime < 2000 && !force) {
        return
    }
    const content = document.getElementById('part-editor').innerHTML
    store.updateDocument({
        id: documentID,
        partArguments: {
            name: document.getElementById('part-args-name').innerText,
            value: content
        }
    })
    lastPartSaveTime = Date.now()
}

function editorHoverHandler(event) {
    const target = event.target
    const tagName = target.tagName
    // clear previously highlighted element
    for (const ele of document.getElementsByClassName('reference-highlight')) {
        ele.classList.remove('reference-highlight')
    }
    if (tagName === 'REFERENCE') {
        const referencedID = target.getAttribute('labels')
        const ele = document.getElementById(referencedID)
        if (ele) {
            ele.classList.add('reference-highlight')
        }
    } else {
        const refEleIDs = target.getAttribute('refs')
        if (!refEleIDs) {
            return
        }
        const refs = refEleIDs.split(',')
        let newRefs = Array()
        for (const refID of refs) {
            const ref = document.getElementById(refID)
            if (ref) {
                ref.classList.add('reference-highlight')
                newRefs.push(refID)
            }
        }
        // update reference times
        var popoverContent = target.getAttribute('data-content')
        if (!popoverContent) {
            return
        }
        var contentParts = popoverContent.split('|')
        if (/Referenced\s\d\stimes/.test(contentParts[contentParts.length - 1])) {
            contentParts[contentParts.length - 1] = ` Referenced ${newRefs.length} times`
        } else {
            contentParts.push(`Referenced ${newRefs.length} times`)
        }
        contentParts = contentParts.map((val) => {
            return val.trim()
        })
        target.setAttribute('data-content', contentParts.join(' | '))
        target.setAttribute('refs', newRefs.join(','))
        $(target).popover('hide')
        $(target).popover('show')
    }
}

function editorContentChangeHandler(event) {
    // check unfounded reference elements
    for (const reference of document.getElementsByTagName('reference')) {
        if (reference.getAttribute('type') === 'cite') continue
        const referenceID = reference.getAttribute('labels')
        const referencedElement = document.getElementById(referenceID)
        if (!referencedElement && !reference.classList.contains('unfounded-reference-highlight')) {
            reference.classList.add('unfounded-reference-highlight')
            reference.setAttribute('data-content', reference.getAttribute('data-content') + '(missing)')
        } else if (referencedElement && reference.classList.contains('unfounded-reference-highlight')) {
            // for some reason, reference founded again.
            const tagName = referencedElement.tagName
            if (tagName === 'IMG' || tagName === 'TABLE') {
                if (!referencedElement.getAttribute('caption')) {
                    continue
                }
            } else if (tagName === 'EQUATION') {
                if (referencedElement.getAttribute('eq-style') != 'display-numbered') {
                    continue
                }
            }
            reference.classList.remove('unfounded-reference-highlight')
            reference.setAttribute('data-content', reference.getAttribute('data-content').replace('(missing)', ''))
        }
    }
    // update outline
    // TODO: need to optimize
    generateOutline()
    // update the scroll bar
    editorScrollBar.resize()
    save(event)
}

function editorKeyHandler(event) {
    var key = event.key
    // monitor justify status
    if (justifyStatus != 'justifyLeft') {
        if (key == 'Backspace' && lastPressedKey == 'Enter') {
            // cancel justify status
            justifyStatus = 'justifyLeft'
            document.execCommand('justifyLeft')
            event.preventDefault()
            lastPressedKey = key
            return
        }
    }
    // monitor stop keys
    for (let i = 0; i < controllingCommands.length; i++) {
        let command = controllingCommands[i]
        let stopKeys = commandEffectsCancelKeys[command]
        if (!stopKeys) {
            continue
        }
        if (stopKeys.indexOf(key) >= 0 && document.queryCommandState(command)) {
            // cancel command
            document.execCommand(command)
            let button = document.querySelector(`[command="${command}"]`)
            button.classList.remove('active')
        }
    }
    // extra manual controls for shortcut
    var shortcutCommand = ''
    if (event.ctrlKey) {
        key = 'ctrl+' + key
        switch (key) {
            case 'ctrl+b':
                shortcutCommand = 'bold'
                break
            case 'ctrl+i':
                shortcutCommand = 'italic'
                break
            case 'ctrl+u':
                shortcutCommand = 'underline'
                break
        }
    }
    // bold, italic and underline's shorcuts
    if (shortcutCommand != '') {
        let button = document.querySelector(`[command="${shortcutCommand}"]`)
        if (document.queryCommandState(shortcutCommand)) {
            // cancel command
            button.classList.remove('active')
        } else {
            // new command
            button.classList.add('active')
        }
    }
    lastPressedKey = key
}

function editorCursorChange() {
    let sel = window.getSelection()
    if (sel.getRangeAt && sel.rangeCount) {
        editorRange = sel.getRangeAt(0)
    }
}

function editorSelectionHandler() {
    for (let i = 0; i < controllingCommands.length; i++) {
        let command = controllingCommands[i]
        let button = document.querySelector(`[command="${command}"]`)
        if (document.queryCommandState(command)) {
            // active
            if (!button.classList.contains('active')) {
                button.classList.add('active')
            }
            // keep buttons of justifying single selected
            if (command.startsWith('justify')) {
                for (let i = 0; i < justifies.length; i++) {
                    let justifyCommand = justifies[i]
                    if (justifyCommand == command) {
                        continue
                    }
                    let button = document.querySelector(`[command="${justifyCommand}"]`)
                    button.classList.remove('active')
                }
                justifyStatus = command
            }
        } else {
            // not active
            if (button.classList.contains('active')) {
                button.classList.remove('active')
            }
        }
    }
    var isJustifySet = false
    for (let i = 0; i < justifies.length; i++) {
        let button = document.querySelector(`[command="${justifies[i]}"]`)
        if (button.classList.contains('active')) {
            isJustifySet = true
            break
        }
    }
    if (!isJustifySet && lastPressedKey != 'ctrl+a') {
        // set to justifyLeft
        document.execCommand('justifyLeft', false, '')
        document.querySelector(`[command="justifyLeft"]`).classList.add('active')
    }
}


// Template buttons' handler
let templateDropdown = document.getElementById('templates-dropdown')
templateDropdown.addEventListener('click', templateDropdownHandler)
let templatePartArgs = document.getElementById('part-arguments')
templatePartArgs.addEventListener('click', templatePartArgsHandler)
let templatePartArgConfirmButton = document.getElementById('part-args-confirm')
templatePartArgConfirmButton.addEventListener('click', confirmPartArg)
let templateArgsConfirmButton = document.getElementById('arguments-confirm')
templateArgsConfirmButton.addEventListener('click', saveArgs)

function saveArgs() {
    var templateName = document.getElementById('current-template').value
    var argsDiv = document.getElementById('arguments-modal-body')
    let args = {}
    if (argsDiv.innerHTML.trim() != '') {
        let currentTemplateArgs = templateArgs[templateName]['args']
        let argNames = Object.keys(currentTemplateArgs)
        for (let i = 0; i < argNames.length; i++) {
            let argName = argNames[i]
            let argElement = document.getElementById(argName)
            var argValue = argElement.value
            if (argValue) {
                args[argName] = argValue
            }
        }
    }
    if (Object.keys(args).length > 0) {
        store.updateDocument({ id: documentID, args: args })
    }
}

// set template's headings
function setTemplateHeadings(templateName) {
    let templateHeadings = templateArgs[templateName]['headings']
    var headings = []
    if (!templateHeadings) {
        headings = ['section', 'subsection', 'subsubsection']
    } else {
        headings = templateHeadings
    }
    let headingsDropdown = document.getElementById('headings-dropdown')
    headingsDropdown.innerHTML = ''
    for (let i = 0; i < headings.length; i++) {
        let newHeading = document.createElement('a')
        newHeading.setAttribute('command', 'formatBlock')
        newHeading.setAttribute('value', 'H' + (i + 1).toString())
        newHeading.classList.add('dropdown-item')
        newHeading.setAttribute('href', '#')
        newHeading.innerText = headings[i]
        headingsDropdown.appendChild(newHeading)
    }
}

// set template's arguments
function setTemplateArguments(templateName) {
    let templateArgsDivId = 'arguments-modal-body'
    let argsDiv = document.getElementById(templateArgsDivId)
    if (argsDiv) {
        // remove
        argsDiv.innerHTML = ''
    }
    // basic arguments
    let currentTemplateArgs = templateArgs[templateName]['args']
    let templateModalButton = document.getElementById('arguments-modal-button')
    // part arguments
    let currentTemplatePartArgs = templateArgs[templateName]['partArgs']
    let partArgsDiv = document.getElementById('part-arguments')
    partArgsDiv.innerHTML = ''
    if (!currentTemplateArgs) {
        // no args
        if (!templateModalButton.classList.contains('d-none')) {
            templateModalButton.classList.add('d-none')
        }
        return
    }
    if (templateModalButton.classList.contains('d-none')) {
        templateModalButton.classList.remove('d-none')
    }
    let argNames = Object.keys(currentTemplateArgs)
    for (let i = 0; i < argNames.length; i++) {
        let argName = argNames[i]
        let { help } = currentTemplateArgs[argName]

        let inputDiv = document.createElement('div')
        inputDiv.classList.add('input-group')
        inputDiv.classList.add('mb-3')
        let inputPrepend = document.createElement('div')
        inputPrepend.classList.add('input-group-prepend')
        let prependSpan = document.createElement('span')
        prependSpan.classList.add('input-group-text')
        prependSpan.setAttribute('id', argName + 'prepend')
        prependSpan.innerText = help
        inputPrepend.appendChild(prependSpan)
        let input = document.createElement('input')
        input.setAttribute('type', 'text')
        input.classList.add('form-control')
        input.setAttribute('aria-describedby', argName + 'prepend')
        input.setAttribute('id', argName)

        inputDiv.appendChild(inputPrepend)
        inputDiv.appendChild(input)
        argsDiv.appendChild(inputDiv)
    }

    if (!currentTemplatePartArgs) {
        // no part args
        if (!partArgsDiv.classList.contains('d-none')) {
            partArgsDiv.classList.add('d-none')
        }
        return
    } else {
        // remove d-none
        if (partArgsDiv.classList.contains('d-none')) {
            partArgsDiv.classList.remove('d-none')
        }
    }
    let partArgNames = Object.keys(currentTemplatePartArgs)
    let partArgsEditorDiv = document.getElementById('part-args-editor')
    for (let i = 0; i < partArgNames.length; i++) {
        let argName = partArgNames[i]
        let { help } = currentTemplatePartArgs[argName]
        let argLink = document.createElement('a')
        argLink.innerText = argName
        argLink.classList.add('anchor-link')
        argLink.classList.add('arguments')
        argLink.setAttribute('href', '#')
        argLink.setAttribute('help', help)
        partArgsDiv.appendChild(argLink)
        partArgsDiv.appendChild(document.createElement('br'))
        let input = document.createElement('input')
        input.setAttribute('type', 'hidden')
        input.setAttribute('name', argName)
        input.setAttribute('id', argName + '-' + 'value')
        input.setAttribute('value', '')
        partArgsEditorDiv.appendChild(input)
    }
    const { stat } = store.getOneDocumentData(documentID)
    const savedArgs = stat['args']
    const savedPartArguments = stat['partArguments']
    // recover args if exist
    for (const argName of Object.keys(savedArgs)) {
        if (argNames.indexOf(argName) < 0) continue
        const argValue = savedArgs[argName]
        document.getElementById(argName).value = argValue
    }
    // recover arguements if exist
    for (const argName of Object.keys(savedPartArguments)) {
        if (partArgNames.indexOf(argName) < 0) continue
        const argValue = savedPartArguments[argName]
        document.getElementById(argName + '-' + 'value').setAttribute('value', argValue)
    }
}

function templateDropdownHandler(event) {
    var target = event.target
    var templateName = target.getAttribute('id')
    var oldSelectedTemplateName = document.getElementById('current-template').value
    if (templateName == oldSelectedTemplateName) {
        // select the same as old
        return
    }
    ipcRenderer.send('alert', 'set template:' + templateName)
    document.getElementById('current-template').value = templateName
    document.getElementById('dropdown-button').innerText = `Templates(${templateName})`

    // headings
    setTemplateHeadings(templateName)

    // arguments
    setTemplateArguments(templateName)

    // update the document config
    store.updateDocument({ id: documentID, templateName: templateName })
}

// template part arguments' handler
function templatePartArgsHandler(event) {
    if (event.target.tagName != 'A') {
        return
    }
    let partArgsEditorDiv = document.getElementById('part-args-editor')
    let partArgsEditor = document.getElementById('part-editor')
    let documentEditor = document.getElementById('editor')
    partArgsEditorDiv.classList.remove('d-none')
    documentEditor.classList.add('d-none')
    document.getElementById('part-args-name').innerText = event.target.innerText
    partArgsEditor.innerHTML = document.getElementById(event.target.innerText + '-' + 'value').value
}

function confirmPartArg() {
    let argName = document.getElementById('part-args-name').innerText
    let partArgsEditorDiv = document.getElementById('part-args-editor')
    let documentEditor = document.getElementById('editor')
    let argValue = document.getElementById('part-editor').innerHTML
    // store value
    document.getElementById(argName + '-' + 'value').setAttribute('value', argValue)
    savePart(true)
    partArgsEditorDiv.classList.add('d-none')
    documentEditor.classList.remove('d-none')
}


/* Compile */

// Compile button's handler
let compileButton = document.getElementById("compile")
compileButton.addEventListener("click", compile)
var isCompiling = false

// setInterval(() => {
//     if (compiledHtml != editor.innerHTML) {
//         compile()
//     }
// }, 1000)

function compile() {
    if (isCompiling) return
    isCompiling = true
    ipcRenderer.sendSync('set-variable', { name: 'isCompileFinish', value: false })
    ipcRenderer.send('alert', 'click: compile')
    // convert args if exist
    var templateName = document.getElementById('current-template').value
    var argsDiv = document.getElementById('arguments-modal-body')
    let args = {}
    if (argsDiv.innerHTML.trim() != '') {
        let currentTemplateArgs = templateArgs[templateName]['args']
        let argNames = Object.keys(currentTemplateArgs)
        for (let i = 0; i < argNames.length; i++) {
            let argName = argNames[i]
            let { help } = currentTemplateArgs[argName]
            let argElement = document.getElementById(argName)
            var argValue = argElement.value
            if (!argValue) {
                argValue = help
            }
            args[argName] = argValue
        }
    }

    let headings = templateArgs[templateName]['headings']
    var converter = new Converter(headings)

    // convert part arguments if exist
    let partArgs = {}
    let currentTemplatePartArgs = templateArgs[templateName]['partArgs']
    if (currentTemplatePartArgs) {
        let partArgNames = Object.keys(currentTemplatePartArgs)
        for (let i = 0; i < partArgNames.length; i++) {
            let argName = partArgNames[i]
            let { help } = currentTemplatePartArgs[argName]
            let argInput = document.getElementById(argName + '-' + 'value')
            if (argInput) {
                partArgs[argName] = converter.convert(argInput.value)
            } else {
                partArgs[argName] = help
            }
        }
    }

    // get editor's content
    var editor = document.getElementById('editor')
    var html = editor.innerHTML
    var latex = converter.convert(html)
    if (!latex && Object.keys(args).length == 0 && Object.keys(partArgs).length == 0) {
        alert("No contents. Please write something before compiling.")
        return
    }
    ipcRenderer.send("alert", "latex:" + latex)

    // get references
    var references = ''
    for (const refEl of document.getElementsByClassName('bibtex')) {
        let referenceText = refEl.getAttribute('bibtex')
        references += referenceText
    }
    args.references = references

    // get images
    // TODO: check images unuploaded
    let images = []
    let unUploadedImages = []
    for (const img of document.getElementsByClassName('inserted-image')) {
        if (img.getAttribute('upload') != 'true') {
            unUploadedImages.push(img)
        }
        const imgID = img.getAttribute('id')
        const imgType = img.getAttribute('format')
        const imgName = imgID + '.' + imgType
        images.push(imgName)
    }
    async.each(unUploadedImages, (imgEl, callback) => {
        if (imgEl.getAttribute('upload') == 'true') callback()
        new Promise((resolve, reject) => {
            checkAndUploadImage(imgEl, resolve, reject)
        }).then(
            successInfo => {
                ipcRenderer.send('alert', successInfo)
                callback()
            },
            errorInfo => {
                ipcRenderer.send('alert', errorInfo)
                callback(errorInfo)
            }
        )
    }, err => {
        if (err) {
            // a image failed to upload, alert user and comtinue the compiling task
            const errInfo = err + '\nSome images will not included in the pdf.'
            ipcRenderer.send('set-variable', { name: 'compileHint', value: errInfo })
            ipcRenderer.send('alert', errInfo)
        } else {
            ipcRenderer.send('alert', 'All images have been uploaded')
        }
        // sending the compiling task
        const compileTask = {
            latex: latex,
            args: args,
            partArgs: partArgs,
            templateName: templateName,
            images: images,
            html: html
        }
        sendCompileTask(compileTask)
    })
}

function sendCompileTask(compileTask) {
    let { latex, args, partArgs, templateName, images, html } = compileTask
    // send the compiling task
    var createTaskBody = {
        'user_id': remote.getGlobal('userID'),
        'document_id': documentID,
        'body': latex,
        'args': JSON.stringify(args),
        'part_args': JSON.stringify(partArgs),
        'template': templateName,
        'images': JSON.stringify(images)
    }
    ipcRenderer.send('alert', 'post task data:' + args + partArgs)
    async.waterfall([
        (callback) => {
            // creating a task
            ipcRenderer.send('set-variable', { name: 'compileHint', value: 'Creating compiling task...' })
            agent
                .post(apiBase + '/tasks')
                .timeout({ response: 10000 })
                .send(createTaskBody)
                .ok(res => res.status == '202')
                .retry(5)
                .then(res => {
                    let task = res.body
                    ipcRenderer.send('alert', 'created task:' + task.task_id)
                    callback(null, task)
                })
                .catch(err => {
                    ipcRenderer.send('alert', 'error when creating the task')
                    callback(err, undefined, 'creating task')
                })
        },
        (task, callback) => {
            // querying the task's status
            // waiting for task finished
            ipcRenderer.send('set-variable', { name: 'compileHint', value: 'Waiting for compiling task...' })
            async.retry({ times: 120, interval: 100 }, (cb) => {
                agent.get(apiBase + `/tasks/${task.task_id}`).end((err, res) => {
                    if (res && res.status == '200') {
                        let task = res.body
                        if (task.status == 'finished') cb(null, task)
                        else cb(true, res)
                    } else {
                        ipcRenderer.send(
                            'alert',
                            `warn: unexpected response when querying task status - ${err.status}`
                        )
                        cb(true, res)
                    }
                })
            }, (err, res) => {
                if (err) callback(err, res, 'querying task status')
                else callback(null, res)
            })
        },
        (task, callback) => {
            // downloading the pdf
            ipcRenderer.send('set-variable', { name: 'compileHint', value: 'Downloading the pdf...' })
            agent.get(apiBase + `/pdfs/${task.pdf_id}`).buffer(true)
                .parse(superagent.parse['application/octet-stream'])
                .ok(res => res.status == '200')
                .retry(2)
                .then(res => {
                    // clear loading animation, pop up pdf viewer
                    const pdfName = `${documentID}.pdf`
                    const pdfPath = path.join(store.dataPath, documentID, pdfName)
                    store.updateDocument({ id: documentID, pdf: { name: pdfName, data: res.body } })
                    ipcRenderer.sendSync('set-variable', { name: 'pdfPath', value: pdfPath })
                    ipcRenderer.sendSync('set-variable', { name: 'isCompileFinish', value: true })
                    isCompiling = false
                    compiledHtml = html
                })
                .catch(err => {
                    callback(err, undefined, 'downloading the pdf')
                })
        }],
        (err, res, info) => {
            ipcRenderer.send('alert', `ERROR when ${info}: ${err}`)
            alert(`error when ${info}: ${err}`)
            ipcRenderer.sendSync('set-variable', { name: 'isCompileFinish', value: true })
            isCompiling = false
        }
    )
}

/* Outline tree */

// Generate outline
function generateOutline() {
    ipcRenderer.send('alert', 'outline')
    var headerValues = {
        H1: 6, H2: 5, H3: 4, H4: 3, H5: 2, H6: 1
    }
    var headers = document.querySelector('div#editor').querySelectorAll("h1, h2, h3, h4, h5, h6")
    var rootHeaders = []
    var getChildrenList = {}
    var lastHeader = ""
    var childrenList = ""

    for (let i = 0; i < headers.length; i++) {
        let headerName = headers[i].tagName
        let content = headers[i].innerHTML
        let md5sum = crypto.createHash('md5')
        md5sum.update(headerName + content + i.toString())
        let hashId = md5sum.digest('hex')
        headers[i].setAttribute('id', hashId)
        if (!lastHeader.id) {
            // first header, set as last header
            lastHeader = {
                id: hashId,
                value: headerValues[headerName],
                parentNode: "",
            }
            rootHeaders.push(hashId)
        } else {
            let currentHeaderValue = headerValues[headerName]
            ipcRenderer.send('alert', 'current value:' + currentHeaderValue + ' last value:' + lastHeader.value)
            if (currentHeaderValue < lastHeader.value) {
                // belong to last node
                childrenList = getChildrenList[lastHeader.id]
                if (!childrenList) {
                    // create last node's children list
                    childrenList = []
                    getChildrenList[lastHeader.id] = childrenList
                }
                childrenList.push(hashId)
                // create new last header
                lastHeader = {
                    id: hashId,
                    value: currentHeaderValue,
                    parentNode: lastHeader,
                }
            } else {
                // need to find parent node
                var parentNode = lastHeader.parentNode
                while (parentNode && parentNode.value <= currentHeaderValue) {
                    parentNode = parentNode.parentNode
                    if (!parentNode) {
                        // no more parent node, belong to outline
                        break
                    }
                }
                if (!parentNode) {
                    // belong to outline
                    lastHeader = {
                        id: hashId,
                        value: currentHeaderValue,
                        parentNode: "",
                    }
                    rootHeaders.push(hashId)
                } else {
                    childrenList = getChildrenList[parentNode.id]
                    if (!childrenList) {
                        // create new children list
                        childrenList = []
                        getChildrenList[parentNode.id] = childrenList
                    }
                    childrenList.push(hashId)
                    lastHeader = {
                        id: hashId,
                        value: currentHeaderValue,
                        parentNode: parentNode,
                    }
                }
            }
        }
    }

    let createElement = function (hasChildren, hashId) {
        var element = document.createElement('li')
        var elementA = document.createElement('a')
        elementA.setAttribute('class', 'anchor-link')
        elementA.setAttribute('link', hashId)
        elementA.setAttribute('href', '#')
        elementA.innerText = document.getElementById(hashId).innerText
        if (hasChildren) {
            var span = document.createElement('span')
            span.appendChild(elementA)
            span.className = 'caret'
            element.appendChild(span)
            var ul = document.createElement('ul')
            ul.setAttribute('id', 'anchor' + hashId)
            ul.className = 'nested'
            element.appendChild(ul)
        } else {
            element.appendChild(elementA)
        }
        return element
    }

    let makeChildrenElements = function (childrenList, parentId) {
        if (!childrenList) {
            return
        }
        for (let i = 0; i < childrenList.length; i++) {
            let childrenId = childrenList[i]
            let children = createElement(
                getChildrenList[childrenId],
                childrenId
            )
            document.querySelector("ul[id='anchor" + parentId + "']").appendChild(children)
            makeChildrenElements(getChildrenList[childrenId], childrenId)
        }
    }

    let treeElement = document.getElementById('tree')
    $('#tree li').remove();
    // treeElement.innerHTML = ''
    for (let i = 0; i < rootHeaders.length; i++) {
        let hashId = rootHeaders[i]
        let childrenList = getChildrenList[hashId]
        treeElement.appendChild(createElement(childrenList, hashId))
        makeChildrenElements(childrenList, hashId)
    }

    ipcRenderer.send('alert', rootHeaders)
    ipcRenderer.send('alert', getChildrenList)
}


// tree's handler
var toggler = document.getElementById("tree");
toggler.addEventListener('click', treeHandler)
var treePanel = $('#tree-panel')

// display the panel when the mouse moving to the left side
$(window).on('mousemove', event => {
    if (treePanel.hasClass('pinned')) {
        return
    } else if (event.pageX < 20 || treePanel.is(':hover')) {
        // display the tree
        if (treePanel.hasClass('hide')) treePanel.removeClass('hide')
    } else {
        // hide the tree
        if (!treePanel.hasClass('hide')) treePanel.addClass('hide')
    }
})

// move the panel to the visible area when it is pinned
$(function () {
    var $treePanel = $("#tree-panel"),
        $window = $(window),
        offset = $treePanel.offset(),
        topPadding = 50

    $window.scroll(function () {
        if ($window.scrollTop() > offset.top) {
            $treePanel.stop().animate({
                marginTop: $window.scrollTop() - offset.top + topPadding
            })
        } else {
            $treePanel.stop().animate({
                marginTop: 0
            })
        }
    })
})

// pin event
var pinTreeButton = $('#pin-tree-panel')
pinTreeButton.on('click', event => {
    var pinTree
    if (pinTreeButton.hasClass('pinned')) {
        pinTreeButton.removeClass('pinned')
        // change the icon's style
        $('#pin-icon').removeClass('pinned')
        // unpin the panel
        treePanel.removeClass('pinned')
        pinTree = false
    } else {
        pinTreeButton.addClass('pinned')
        // change the icon's style
        $('#pin-icon').addClass('pinned')
        // pin the panel
        treePanel.addClass('pinned')
        pinTree = true
    }
    store.updateDocument({ id: documentID, pinTree: pinTree })
})

function treeHandler(event) {
    var target = event.target
    if (target.tagName == 'SPAN') {
        target.parentElement.querySelector(".nested").classList.toggle("active");
        target.classList.toggle("caret-down");
    } else if (target.tagName == 'A' && !target.classList.contains('arguments')) {
        if (target.getAttribute('id') == "refresh-link") {
            generateOutline()
        } else {
            var targetId = target.getAttribute('link')
            var selectedElement = document.querySelector("[id='" + targetId + "']")
            selectedElement.scrollIntoView(true, { behavior: "smooth" })
        }
    }
}

