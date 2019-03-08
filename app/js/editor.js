const { ipcRenderer } = require('electron')
const remote = require('electron').remote

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

    var error = (jqXHR, textStatus, errorThrown) => {
        var debugDiv = $("div#debug-ingo")
        debugDiv.text(jqXHR.status + ": " + jqXHR.statusText)
        debugDiv.removeClass("d-none")
    }

    var success = (data) => {
        ipcRenderer.sendSync("add-task", "temp")
        ipcRenderer.send("pop-page", "pdfviewer")
    }

    html = document.getElementById("editor").innerHTML
    html = "<html><head></head><body>" + html + "</body></html>"
    url = remote.getGlobal("apiBase") + "/compile/start"

    $.ajax({
        url: url,
        type: "post",
        data: {html: html, task: "temp"},
        error: error,
        success: success
    })
}