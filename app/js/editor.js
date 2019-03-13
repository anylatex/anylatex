const { ipcRenderer } = require('electron')
const remote = require('electron').remote
const path = require('path')
const { Converter } = require(path.resolve('app/js/converter.js'))
const crypto = require('crypto')

/* Toolbar handler */

// Basic buttons' handler
let toolbar = document.getElementById("toolbar")
toolbar.addEventListener("click", toolbarHandler)

function toolbarHandler(event) {
    var target = event.target
    var command = target.getAttribute("command")
    var value = target.getAttribute("value")
    ipcRenderer.sendSync("alert", "click: "+command)
    document.execCommand(command, false, value)
    // If inserted an heading, call outline generator
    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(value) >= 0) {
        generateOutline()
    }
}

// Compile button's handler
let compileButton = document.getElementById("compile")
compileButton.addEventListener("click", compile)

function compile() {
    var html = document.getElementById("editor").innerHTML
    var converter = new Converter(html)
    var latex = converter.convert()
    ipcRenderer.send("alert", "latex: "+latex)

    // send the compiling task
    var baseRequest = remote.getGlobal('baseRequest')
    var body = {
        'user_id': remote.getGlobal('userId'),
        'latex': latex
    }
    baseRequest.post(
        '/tasks',
        {'body': body},
        (error, response, jsonBody) => {
            if (error) {
                var debugDiv = document.getElementById('debug-info')
                debugDiv.innerText = error + ': ' + jsonBody
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

