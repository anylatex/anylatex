const { ipcRenderer } = require('electron')
const remote = require('electron').remote
const path = require('path')
const { Converter } = require(path.resolve('app/js/converter.js'))

let toolbar = document.getElementById("toolbar")
toolbar.addEventListener("click", toolbarHandler)

function toolbarHandler(event) {
    var target = event.target
    var command = target.getAttribute("command")
    var value = target.getAttribute("value")
    ipcRenderer.sendSync("alert", "click: "+command)
    document.execCommand(command, false, value)
}

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
                var debugDiv = $("div#debug-info")
                debugDiv.text(error + ': ' + jsonBody)
                debugDiv.removeClass("d-none")
            } else {
                ipcRenderer.sendSync("add-task", jsonBody['task_id'])
                ipcRenderer.send("pop-page", "pdfviewer")
            }
        }
    )
}