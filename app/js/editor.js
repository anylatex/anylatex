const { ipcRenderer } = require('electron')
const remote = require('electron').remote

let toolbar = document.getElementById("toolbar")
toolbar.addEventListener("click", toolbarHandler)

function toolbarHandler(event) {
    var target = event.target
    var command = ""
    var value = ""
    ipcRenderer.sendSync("alert", "click: "+target.id)
    switch(target.id) {
        case "b-bold":
            command = "bold"
            break
        case "b-italic":
            command = "italic"
            break
        case "b-underline":
            command = "underline"
            break
        case "b-leftalign":
            command = "justifyLeft"
            break
        case "b-centeralign":
            command = "justifyCenter"
            break
        case "b-rightalign":
            command = "justifyRight"
            break
        case "b-h1":
            command = "formatBlock"
            value = "H1"
            break
        case "b-h2":
            command = "formatBlock"
            value = "H2"
            break
        case "b-h3":
            command = "formatBlock"
            value = "H3"
            break
        case "b-compile":
            compile()
            return
    }
    document.execCommand(command, false, value)
}

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