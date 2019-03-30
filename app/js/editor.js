const { ipcRenderer } = require('electron')
const remote = require('electron').remote
const path = require('path')
const { Converter } = require(path.resolve('app/js/converter.js'))
const crypto = require('crypto')
const fs = require('fs')
const store = remote.getGlobal('store')

/* Setup current document's name and id */
let documentID = remote.getGlobal('currentDocumentID')
let documentName = remote.getGlobal('currentDocumentName')
document.title = 'Editor - ' + documentName

/* Load the document's content */
let documentContentPath = path.join(store.dataPath, documentID, 'document.html')
if (fs.existsSync(documentContentPath)) {
    let content = fs.readFileSync(documentContentPath)
    document.getElementById('editor').innerHTML = content
    // enable popovers
    $(function () {
        $('[data-toggle="popover"]').popover()
    })
}

/* Get Available Templates */
let baseRequest = remote.getGlobal('baseRequest')
// Templates Arguments
let templateArgs = remote.getGlobal('templateArgs')
baseRequest.get(
    '/templates',
    (error, response, jsonBody) => {
        var responseCode = ''
        if (response) {
            responseCode = response.statusCode.toString()
        }
        if (error || !responseCode.startsWith('2')) {
            var debugDiv = document.getElementById('debug-info')
            debugDiv.innerText = error + ': ' + responseCode + '\n' + jsonBody
            debugDiv.classList.remove('d-none')
        } else {
            parseTemplates(jsonBody)
        }
    }
)

function parseTemplates(jsonBody) {
    ipcRenderer.send('alert', Object.keys(jsonBody))
    let templateNames = Object.keys(jsonBody)
    let dropdownElement = document.getElementById('templates-dropdown')
    var defaultTemplateName = ''
    for (let i = 0; i < templateNames.length; i++) {
        let templateName = templateNames[i]
        if (templateName == 'default') {
            defaultTemplateName = jsonBody.default
            document.getElementById('current-template').value = defaultTemplateName
            continue
        }
        let dropdownItem = document.createElement('a')
        dropdownItem.className = 'dropdown-item'
        dropdownItem.setAttribute('href', '#')
        dropdownItem.setAttribute('id', templateName)
        dropdownItem.innerText = templateName
        dropdownElement.appendChild(dropdownItem)
        let { headings, args, part_args: partArgs } = jsonBody[templateName]
        if (!headings) {
            headings = ['section', 'subsection', 'subsubsection']
        }
        templateArgs[templateName] = {
            headings: headings,
            args: args,
            partArgs: partArgs
        }
    }
    document.getElementById('dropdown-button').innerText = `Templates(${defaultTemplateName})`
    // set headings and arguments
    setTemplateHeadings(defaultTemplateName)
    setTemplateArguments(defaultTemplateName)
}

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
    document.getElementById('editor').innerHTML += (reference.outerHTML)
    // clear reference editor
    document.getElementById('reference-editor').innerHTML = ''
    labelEl.innerHTML = ''
})

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
editor.addEventListener('keydown', editorKeyHandler)
$('#editor').on('blur keyup paste input', save)
document.addEventListener('selectionchange', editorSelectionHandler)

function save() {
    if (Date.now() - lastSaveTime < 2) {
        return
    }
    const content = document.getElementById('editor').innerHTML
    store.updateDocument({
        id: documentID,
        htmlContent: content
    })
    lastSaveTime = Date.now()
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
    if (document.getElementById(event.target.innerText + '-' + 'value')) {
        // input element exists, restore inner html
        partArgsEditor.innerHTML = document.getElementById(event.target.innerText + '-' + 'value').value
    } else {
        let input = document.createElement('input')
        input.setAttribute('type', 'hidden')
        input.setAttribute('name', event.target.innerText)
        input.setAttribute('id', event.target.innerText + '-' + 'value')
        partArgsEditorDiv.appendChild(input)
        partArgsEditor.innerHTML = ''
    }
}

function confirmPartArg() {
    let argName = document.getElementById('part-args-name').innerText
    let partArgsEditorDiv = document.getElementById('part-args-editor')
    let documentEditor = document.getElementById('editor')
    let argValue = document.getElementById('part-editor').innerHTML
    // store value
    document.getElementById(argName + '-' + 'value').setAttribute('value', argValue)
    partArgsEditorDiv.classList.add('d-none')
    documentEditor.classList.remove('d-none')
}


/* Compile */

// Compile button's handler
let compileButton = document.getElementById("compile")
compileButton.addEventListener("click", compile)

function compile() {
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

    // send the compiling task
    var body = {
        'user_id': remote.getGlobal('userID'),
        'body': latex,
        'args': JSON.stringify(args),
        'part_args': JSON.stringify(partArgs),
        'template': templateName
    }
    ipcRenderer.send('alert', 'post task data:'+ args + partArgs)
    baseRequest.post(
        '/tasks',
        {'body': body},
        (error, response, jsonBody) => {
            var responseCode = ''
            if (response) {
                responseCode = response.statusCode.toString()
            }
            if (error || !responseCode.startsWith('2')) {
                var debugDiv = document.getElementById('debug-info')
                debugDiv.innerText = error + ': ' + responseCode + '\n' + jsonBody
                debugDiv.classList.remove('d-none')
            } else {
                ipcRenderer.sendSync("add-task", jsonBody['task_id'])
                ipcRenderer.send("pop-page", "pdfviewer")
            }
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

