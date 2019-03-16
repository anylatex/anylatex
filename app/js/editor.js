const { ipcRenderer } = require('electron')
const remote = require('electron').remote
const path = require('path')
const { Converter } = require(path.resolve('app/js/converter.js'))
const crypto = require('crypto')

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
        let { args } = jsonBody[templateName]
        if (!args) {
            // has no arguments
            continue
        } else {
            templateArgs[templateName] = args
        }
    }
    document.getElementById('dropdown-button').innerText = `Templates(${defaultTemplateName})`
}


/* Toolbar and Editor's handlers */

// current format relating status
let controllingCommands = [
    'bold', 'italic', 'underline'
]
let commandEffectsCancelKeys = {
    bold: ['Enter', ' '],
    italic: ['Enter', ' '],
    underline: ['Enter', ' '],
}
var currentActiveCommands = []
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
        // record command if it is a command needed manual control
        let index = currentActiveCommands.indexOf(command)
        if (index >= 0) {
            // cancel command
            let button = document.querySelector(`[command="${command}"]`)
            button.classList.remove('active')
            currentActiveCommands.pop(index)
        } else {
            // new command
            let button = document.querySelector(`[command="${command}"]`)
            button.classList.add('active')
            currentActiveCommands.push(command)
        }
    }
    if (command.startsWith('justify')) {
        justifyStatus = command
    }
    document.execCommand(command, false, value)
    // If inserted an heading, call outline generator
    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(value) >= 0) {
        generateOutline()
    }
}

let editor = document.getElementById('editor')
editor.addEventListener('keydown', editorHandler)

function editorHandler(event) {
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
    var newActiveCommands = []
    for(let i = 0; i < currentActiveCommands.length; i++) {
        let command = currentActiveCommands[i]
        let stopKeys = commandEffectsCancelKeys[command]
        if (stopKeys.indexOf(key) >= 0) {
            // cancel command
            document.execCommand(command)
            let button = document.querySelector(`[command="${command}"]`)
            button.classList.remove('active')
        } else {
            newActiveCommands.push(command)
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
        let index = newActiveCommands.indexOf(shortcutCommand)
        let button = document.querySelector(`[command="${shortcutCommand}"]`)
        if (index >= 0) {
            // cancel command
            button.classList.remove('active')
            newActiveCommands.pop(index)
        } else {
            // new command
            button.classList.add('active') 
            newActiveCommands.push(shortcutCommand)
        }
    }
    // backspace after ctrl+a will clear all formats
    if (key == 'Backspace' && lastPressedKey == 'ctrl+a') {
        for (let i = 0; i < newActiveCommands.length; i++) {
            let command = newActiveCommands[i]
            let button = document.querySelector(`[command="${command}"]`)
            button.classList.remove('active')
        }
        newActiveCommands = []
    }
    currentActiveCommands = newActiveCommands
    lastPressedKey = key
}


// Template buttons' handler
let templateDropdown = document.getElementById('templates-dropdown')
templateDropdown.addEventListener('click', templateDropdownHandler)

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

    let templateArgsDivId = 'template-args'
    let editor = document.getElementById('editor')
    let argsDiv = document.getElementById(templateArgsDivId)
    if (argsDiv) {
        // remove
        argsDiv.remove()
    }

    let currentTemplateArgs = templateArgs[templateName]
    if (!currentTemplateArgs) {
        // no args
        return
    }
    let argNames = Object.keys(currentTemplateArgs)
    let argDiv = document.createElement('div')
    argDiv.setAttribute('id', templateArgsDivId)
    for (let i = 0; i < argNames.length; i++) {
        let argName = argNames[i]
        let { help } = currentTemplateArgs[argName]
        let input = document.createElement('input')
        input.setAttribute('id', argName)
        input.setAttribute('placeholder', help)
        input.setAttribute('type', 'text')
        input.setAttribute('value', '')
        argDiv.appendChild(input)
    }
    let originInEditor = editor.innerHTML
    editor.innerHTML = argDiv.outerHTML + originInEditor
}


// Compile button's handler
let compileButton = document.getElementById("compile")
compileButton.addEventListener("click", compile)

function compile() {
    ipcRenderer.send('alert', 'click: compile')
    // convert args if exist
    var templateName = document.getElementById('current-template').value
    var argDiv = document.getElementById('template-args')
    let args = {}
    if (argDiv) {
        let currentTemplateArgs = templateArgs[templateName]
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
        argDiv.remove()
    }
    var editor = document.getElementById('editor')
    var html = editor.innerHTML
    // readd argDiv
    if (argDiv) {
        editor.insertBefore(argDiv, editor.firstChild) 
    }
    var converter = new Converter(html)
    var latex = converter.convert()
    ipcRenderer.send('alert', "args:"+args)
    ipcRenderer.send("alert", "body: "+latex)

    // send the compiling task
    var body = {
        'user_id': remote.getGlobal('userId'),
        'body': latex,
        'args': JSON.stringify(args),
        'template': templateName
    }
    ipcRenderer.send('alert', 'post task data:'+ body)
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
    } else if (target.tagName == 'A') {
        if (target.getAttribute('id') == "refresh-link") {
            generateOutline()
        } else {
            var targetId = target.getAttribute('link')
            var selectedElement = document.querySelector("[id='" + targetId + "']")
            selectedElement.scrollIntoView(true, {behavior: "smooth"})
        }
    }
}

