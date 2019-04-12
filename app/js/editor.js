const { ipcRenderer } = require('electron')
const remote = require('electron').remote
const path = require('path')
const { Converter } = require(path.resolve('app/js/converter.js'))
const crypto = require('crypto')
const async = require('async')
const superagent = require('superagent')
const store = remote.getGlobal('store')

const apiBase = store.getConfig('apiBase')
const agent = superagent.agent().timeout({response: 20000})

/* Setup current document's name and id */
let documentID = remote.getGlobal('currentDocumentID')
let documentName = remote.getGlobal('currentDocumentName')
document.title = 'Editor - ' + documentName

/* Tool Functions */
var editorRange = ''
// Credit: Tim Down at https://stackoverflow.com/a/6691294
function insertElementAtCaret(html) {
    const range = editorRange
    range.deleteContents();

    var el = document.createElement("div");
    el.innerHTML = html;
    var frag = document.createDocumentFragment(), node;
    while ( (node = el.firstChild) ) {
        frag.appendChild(node);
    }
    range.insertNode(frag);
    // force saving
    save(null, true)
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
(function(){
    let { documentContent, stat } = store.getOneDocumentData(documentID)
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
    if (partArguments) {
        for (const argName of Object.keys(partArguments)) {
            const argValue = partArguments[argName]
            document.getElementById(argName + '-' + 'value').setAttribute('value', argValue)
        }
    }
    if (args) {
        let argNames = Object.keys(args)
        for (let i = 0; i < argNames.length; i++) {
            const name = argNames[i]
            const value = args[name]
            let argElement = document.getElementById(name)
            argElement.value = value
        }
    }
})()

/* Modal buttons' handlers */
let modalOpenButtons = document.getElementsByClassName('modal-open-button')
let modalCloseButtons = document.getElementsByClassName('modal-dismiss-button')
Array.from(modalOpenButtons).forEach(function(element) {
    element.addEventListener('click', () => {
        document.getElementById('navbar').classList.remove('fixed-top')
    })
});
Array.from(modalCloseButtons).forEach(function(element) {
    element.addEventListener('click', () => {
        document.getElementById('navbar').classList.add('fixed-top')
    })
});


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
    } catch(err) {}
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

    let reference = document.createElement('reference')
    reference.classList.add('reference')
    reference.setAttribute('reference', bibtexText)
    reference.setAttribute('labels', labelText)
    reference.setAttribute('contenteditable', 'false')
    // set up popover and enable it
    reference.setAttribute('data-toggle', 'popover')
    reference.setAttribute('title', labelText)
    reference.setAttribute('data-content', bibtexText)
    reference.setAttribute('data-trigger', 'hover')
    reference.setAttribute('data-placement', 'top')
    let id = '_' + Math.random().toString(36).substr(2, 9)
    reference.setAttribute('id', id)
    $(function () {
        $('#'+id).popover()
    })
    if (document.getElementById('reference-sup-check').checked) {
        reference.innerHTML = '<sup>[*]</sup>'
    } else {
        reference.innerHTML = '[*]'
    }
    insertElementAtCaret('<span>' + reference.outerHTML + '</span>')
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

function decodeImageFromBase64(source, binaryData=true, hash=true) {
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
(function(){
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
    var tableAttributes = `frame=${frame} ` + `rules=${rules} `
                            + `row=${tableRowNumber} ` + `col=${tableColNumber} `
                            + 'data-toggle=popover ' + 'title=Caption '
                            + `data-content='${tableCaption}' ` + 'data-trigger=hover '
                            + `data-placement=top ` + `popid=${tablePopID} `
    if (tableCaption != 'No Caption') tableAttributes += `caption=${tableCaption}`
    let html = [`<table ${tableAttributes}`]
    let colInRow = ''
    html.push('<tr>')
    for (let i = 0; i < tableColNumber; i++) {
        html.push('<th></th>')
        colInRow += '<td></td>'
    }
    html.push('</tr>')
    for (let i = 0; i < tableRowNumber -1; i++) {
        html.push(`<tr>${colInRow}</tr>`)
    }
    html.push('</table>')

    // insert the table and enable popover
    const htmlString = html.join('\n')
    insertElementAtCaret(htmlString)
    $(function() {
        $(`[popid='${tablePopID}']`).popover()
    })
    ipcRenderer.send('alert', 'inserted a table')
}

/* Equation input modal */

var mathFieldSpan = document.getElementById('math-field');
var latexSpan = document.getElementById('latex');

var MQ = MathQuill.getInterface(2); // for backcompat
var mathField = MQ.MathField(mathFieldSpan, {
  spaceBehavesLikeTab: true, // configurable
  handlers: {
    edit: function() { // useful event handlers
      latexSpan.textContent = mathField.latex(); // simple API
    }
  }
});

for (const equation of document.getElementsByClassName('equation-container')) {
    equation.addEventListener('click', equationClick)
}
document.getElementById('equation-confirm').addEventListener('click', equationConfirm)

// render example equations
MQ.StaticMath(document.getElementById('example-inline-equation'))
MQ.StaticMath(document.getElementById('example-display-numbered-equation'))
MQ.StaticMath(document.getElementById('example-display-unnumbered-equation'))

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
    MQ.StaticMath(document.getElementById(equationID))
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
    ipcRenderer.sendSync("alert", "click: "+command)
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
$('#editor').on('blur keyup paste input', save)
$('#part-editor').on('blur keyup paste input', savePart)
document.addEventListener('selectionchange', editorSelectionHandler)
$('#editor').bind('keyup click focus', editorCursorChange)
// ctrl+s, force saving
document.addEventListener('keydown', event => {
    if( event.ctrlKey  == true && event.key == 's' ) {
        save(null, true)
    }
})

function save(event, force=false) {
    if (Date.now() - lastSaveTime < 2000 && !force) {
        return
    }
    if (editor.innerHTML == lastSaveHtml && !force) {
        return
    }
    const startTime = Date.now()
    document.getElementById('save-hint').classList.add('d-none')
    document.getElementById('save-loader').classList.remove('d-none')
    const content = document.getElementById('editor').innerHTML
    store.updateDocument({
        id: documentID,
        htmlContent: content
    })
    if (Date.now() - startTime < 500) {
        setTimeout(() => {
            document.getElementById('save-hint').classList.remove('d-none')
            document.getElementById('save-loader').classList.add('d-none')
        }, 1000)
    } else {
        document.getElementById('save-hint').classList.remove('d-none')
        document.getElementById('save-loader').classList.add('d-none')
    }
    lastSaveTime = Date.now()
    lastSaveHtml = editor.innerHTML
}

function savePart(event, force=false) {
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
    for(let i = 0; i < controllingCommands.length; i++) {
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
        switch(key) {
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
    if (sel.getRangeAt && sel.rangeCount){
        editorRange = sel.getRangeAt(0)
    }
}

function editorSelectionHandler() {
    for(let i = 0; i < controllingCommands.length; i++) {
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
        newHeading.setAttribute('value', 'H'+(i+1).toString())
        newHeading.classList.add('dropdown-item')
        newHeading.setAttribute('href', '#')
        newHeading.innerText = headings[i]
        headingsDropdown.appendChild(newHeading)
    }
}

// set template's arguments
function setTemplateArguments(templateName){
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
        if (templateModalButton.classList.contains('disabled') < 0 ) {
            templateModalButton.classList.add('disabled')
        }
        return
    }
    if (templateModalButton.classList.contains('disabled') >= 0) {
        templateModalButton.classList.remove('disabled')
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
        prependSpan.setAttribute('id', argName+'prepend')
        prependSpan.innerText = help
        inputPrepend.appendChild(prependSpan)
        let input = document.createElement('input')
        input.setAttribute('type', 'text')
        input.classList.add('form-control')
        input.setAttribute('aria-describedby', argName+'prepend')
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
}

function templateDropdownHandler(event) {
    var target = event.target
    var templateName = target.getAttribute('id')
    var oldSelectedTemplateName = document.getElementById('current-template').value
    if (templateName == oldSelectedTemplateName) {
        // select the same as old
        return
    }
    ipcRenderer.send('alert', 'set template:'+templateName)
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

function compile() {
    document.getElementById('navbar').classList.remove('fixed-top')
    document.getElementById('loader-container').classList.remove('d-none')
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
    for (const refEl of document.getElementsByClassName('reference')) {
        let referenceText = refEl.getAttribute('reference')
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
    document.getElementById('loader-hint').innerText = 'Uploading images...'
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
            alert(err + '\nSome images will not included in the pdf.')
        } else  {
            ipcRenderer.send('alert', 'All images have been uploaded')
        }
        // sending the compiling task
        const compileTask = {
            latex: latex,
            args: args,
            partArgs: partArgs,
            templateName: templateName,
            images: images
        }
        sendCompileTask(compileTask)
    })
}

function sendCompileTask(compileTask) {
    let { latex, args, partArgs, templateName, images } = compileTask
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
    ipcRenderer.send('alert', 'post task data:'+ args + partArgs)
    async.waterfall([
        (callback) => {
            // creating a task
            document.getElementById('loader-hint').innerText = 'Creating compiling task...'
            agent
                .post(apiBase + '/tasks')
                .timeout({response: 10000})
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
            // timeout of 60s waiting for task finished
            document.getElementById('loader-hint').innerText = 'Waiting for compiling...'
            async.retry({ times: 120, interval: 500 }, (cb) => {
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
            document.getElementById('loader-hint').innerText = 'Downloading the pdf...'
            agent.get(apiBase + `/pdfs/${task.pdf_id}`).buffer(true)
                .parse(superagent.parse['application/octet-stream'])
                .ok(res => res.status == '200')
                .retry(2)
                .then(res => {
                    // clear loading animation, pop up pdf viewer
                    document.getElementById('navbar').classList.add('fixed-top')
                    document.getElementById('loader-container').classList.add('d-none')
                    const pdfName = `${task.pdf_id}.pdf`
                    const pdfPath = path.join(store.dataPath, documentID, pdfName)
                    store.updateDocument({ id: documentID, pdf: { name: pdfName, data: res.body } })
                    ipcRenderer.sendSync('set-variable', {name: 'pdfPath', value: pdfPath})
                    ipcRenderer.send('pop-page', 'pdfviewer')
                })
                .catch(err => {
                    callback(err, undefined, 'downloading the pdf')
                })
        }],
        (err, res, info) => {
            // clear loading animation
            document.getElementById('navbar').classList.add('fixed-top')
            document.getElementById('loader-container').classList.add('d-none')
            ipcRenderer.send('alert', `ERROR when ${info}: ${err}`)
            alert('error when sending requests to the server.')
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
        md5sum.update(headerName+content+i.toString())
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
            ipcRenderer.send('alert', 'current value:'+currentHeaderValue+' last value:'+lastHeader.value)
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
        var  elementA = document.createElement('a')
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
            ul.setAttribute('id', hashId)
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
            document.querySelector("ul[id='"+parentId+"']").appendChild(children)
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
            selectedElement.scrollIntoView(true, {behavior: "smooth"})
        }
    }
}

