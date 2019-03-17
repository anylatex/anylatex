const { ipcRenderer } = require('electron')
const remote = require('electron').remote

var baseRequest = remote.getGlobal('baseRequest')
var currentTaskId = remote.getGlobal("currentCompilingTask")

// get compiling status
var isContinue = true
var pdfData = ""
while (isContinue) {
    $.ajax({
        url: 'http://latex.0x7cc.com:8080/tasks/'+currentTaskId,
        type: "get",
        success: (data) => {
            ipcRenderer.send('alert', 'received raw data')
            if (data['status'] == 'finished') {
                isContinue = false
                pdfData = data['pdf_b64']
                ipcRenderer.send('alert', 'downloaded pdf content')
            }
        },
        async: false
    })
}

// delete the task
baseRequest.delete(
    '/tasks/' + currentTaskId,
    (error, response, jsonBody) => {
        if (error) {
            ipcRenderer.send(
                'alert',
                'error when deleting the task ' +
                currentTaskId + ' error: ' + jsonBody
            )
        } else {
            ipcRenderer.send('alert', 'delete task successfully')
        }
    }
)

pdfData = atob(pdfData)

// render pdf
var pdfjsLib = window['pdfjs-dist/build/pdf']
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.0.943/build/pdf.worker.js'
const cMapUrl= 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.0.943/cmaps/'
const cMapPacked= true
var loadingTask = pdfjsLib.getDocument({data: pdfData, cMapUrl: cMapUrl, cMapPacked: cMapPacked})
loadingTask.promise.then(function (pdf) {
    // Fetch the first page
    for (let pageNumber = 1; pageNumber < pdf.numPages+1; pageNumber++) {
        pdf.getPage(pageNumber).then(function (page) {
            // adjust size
            var scale = 5
            var viewport = page.getViewport(scale)
            var canvasContainer = document.getElementById('wrapper')
            var canvas = document.createElement('canvas')
            var context = canvas.getContext('2d')
            canvas.width = viewport.width
            canvas.height = viewport.height
            canvas.style.width = "100%"
            canvas.style.height = "100%"
            canvasContainer.style.width = Math.floor(viewport.width / scale) + 'pt'
            canvasContainer.style.height = Math.floor(viewport.height / scale) + 'pt'
            canvasContainer.appendChild(canvas)
            // render pdf into canvas context
            var renderContext = {
                canvasContext: context,
                viewport: viewport
            }
            var renderTask = page.render(renderContext)
            renderTask.promise.then(function () {
            })
        })
    }
}, function (reason) {
    // pdf loading error
    ipcRenderer.send("alert", "pdf render error:" + reason)
})