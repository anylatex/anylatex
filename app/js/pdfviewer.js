const { ipcRenderer } = require('electron')
const remote = require('electron').remote

var apiBase = remote.getGlobal("apiBase")
var currentTask = remote.getGlobal("currentCompilingTask")
var pdfUrl = apiBase + '/compile/result/' + currentTask
var statusUrl = apiBase + '/compile/status/' + currentTask
var finishUrl = apiBase + '/compile/delete/' + currentTask

// get compiling status
var isContinue = true
while (isContinue) {
    $.ajax({
        url: statusUrl,
        type: "get",
        success: (data) => {
            ipcRenderer.send("alert", data)
            isContinue = false
        },
        async: false
    })
}

// render pdf
var pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.0.943/build/pdf.worker.js';
var loadingTask = pdfjsLib.getDocument(pdfUrl);
loadingTask.promise.then(function (pdf) {
    // Fetch the first page
    var pageNumber = 1;
    pdf.getPage(pageNumber).then(function (page) {
        // adjust size
        var scale = 5;
        var viewport = page.getViewport(scale);
        var canvas = document.getElementById('the-canvas');
        var wrapper = document.getElementById("wrapper");
        var context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        wrapper.style.width = Math.floor(viewport.width / scale) + 'pt';
        wrapper.style.height = Math.floor(viewport.height / scale) + 'pt';
        // render pdf into canvas context
        var renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        var renderTask = page.render(renderContext);
        renderTask.promise.then(function () {
        });
    });
    $.ajax({
        url: finishUrl,
        type: "get",
        error: (jqXHR, textStatus, errorThrown) => {
            ipcRenderer.send("alert", jqXHR.status + ": " + jqXHR.statusText)
        },
        success: (data) => {
            ipcRenderer.send("alert", "delete pdf successfully")
        },
        async: false
    })
}, function (reason) {
    // pdf loading error
    ipcRenderer.send("alert", "pdf render error:" + reason)
});