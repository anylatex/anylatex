/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs')
const path = require('path')
const { ipcRenderer, remote } = require('electron')
const dialog = remote.dialog

const documentID = remote.getGlobal('currentDocumentID')
const documentName = remote.getGlobal('currentDocumentName')

// register context menu
$.contextMenu({
    selector: '#viewerContainer', 
    callback: function(key, options) {
        if (key === 'save') {
            const pdfPath = remote.getGlobal('pdfPath')
            if (!pdfPath || pdfPath.search(`${documentID}.pdf`) < 0) {
                alert('no pdf available.')
                return
            }
            const filePath = dialog.showSaveDialog({
                defaultPath: documentName + '.pdf'
            })
            if (!filePath) return
            fs.copyFile(pdfPath, filePath, (err) => {
                if (err) {
                    ipcRenderer.send('alert', 'ERROR when saving pdf:' + err)
                    alert('Save pdf fail: ' + err)
                }
            })
        }
    },
    items: {
        "save": {name: "save"}
    }
})

'use strict';

if (!pdfjsLib.getDocument || !pdfjsViewer.PDFViewer) {
  alert('Please build the pdfjs-dist library using\n' +
        '  `gulp dist-install`');
}

// The workerSrc property shall be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve(__dirname, '../node_modules/pdfjs-dist/build/pdf.worker.js')

// Some PDFs need external cmaps.
//
var CMAP_URL = path.resolve(__dirname, "../node_modules/pdfjs-dist/cmaps/") + '/'
var CMAP_PACKED = true;

//var DEFAULT_URL = remote.getGlobal('pdfPath');
var SEARCH_FOR = ''; // try 'Mozilla';

var container = document.getElementById('viewerContainer');

// (Optionally) enable hyperlinks within PDF files.
var pdfLinkService = new pdfjsViewer.PDFLinkService();

// (Optionally) enable find controller.
var pdfFindController = new pdfjsViewer.PDFFindController({
  linkService: pdfLinkService,
});

var pdfViewer = new pdfjsViewer.PDFViewer({
  container: container,
  linkService: pdfLinkService,
  findController: pdfFindController,
});
pdfLinkService.setViewer(pdfViewer);

document.addEventListener('pagesinit', function () {
  // We can use pdfViewer now, e.g. let's change default scale.
  pdfViewer.currentScaleValue = 'page-width'
  pdfViewer._setScale('page-width')

  if (SEARCH_FOR) { // We can try search for things
    pdfFindController.executeCommand('find', { query: SEARCH_FOR, });
  }
});

window.addEventListener('resize', function () {
  pdfViewer.currentScaleValue = 'page-width'
  pdfViewer._setScale('page-width')
})

var lastScrollPageNumber = ''

var scrollbar = null
// Loading document.
var loadingPDF = (pdfPATH) => {
    ipcRenderer.send('set-variable', { name: 'renderPDF', value: false })
    const pageNumber = pdfViewer.currentPageNumber
    if (pageNumber) {
        lastScrollPageNumber = pageNumber
    }
    var loadingTask = pdfjsLib.getDocument({
        url: pdfPATH,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
    });
    loadingTask.promise.then(function (pdfDocument) {
        // Document loaded, specifying document for the viewer and
        // the (optional) linkService.
        pdfViewer.setDocument(pdfDocument);

        pdfLinkService.setDocument(pdfDocument, null);
        if (lastScrollPageNumber > 0) {
            setTimeout(() => {
                pdfViewer.scrollPageIntoView({pageNumber: lastScrollPageNumber})
                // enable the custom scrollbar
                if (!scrollbar) {
                    scrollbar = $("#viewerContainer").niceScroll({
                        grabcursorenabled: false
                    })
                } else {
                    scrollbar.resize()
                }
                // hide navbar
                document.getElementById('navbar').classList.add('d-none')
            }, 500)
        }
    });

}

var isFirstLoad = true
setInterval(() => {
    const isCompileFinished = remote.getGlobal('isCompileFinish')
    var loader = document.getElementById('loader')
    const pdfPath = remote.getGlobal('pdfPath')
    if (isCompileFinished === undefined && (!pdfPath || pdfPath.search(`${documentID}.pdf`) < 0)) {
        // no pdf, show navbar to give hints
        if (document.getElementById('navbar').classList.contains('d-none')) {
            const spinner = document.getElementById('loader-spinner')
            document.getElementById('navbar').classList.remove('d-none')
            loader.classList.remove('d-none')
            spinner.classList.add('d-none')
            document.getElementById('loader-hint').innerText = 'Press "ctrl+s" or click "compile" button above to compile the PDF'
        }
        return
    }
    if (isCompileFinished) {
        if (loader.classList.contains('d-none') && !isFirstLoad) {
            return
        }
        isFirstLoad = false
        // hide loader
        loader.classList.add('d-none')
        // render pdf
        if (pdfPath && pdfPath.search(`${documentID}.pdf`) >= 0) {
            loadingPDF(remote.getGlobal('pdfPath'))
        }
    } else if (isCompileFinished === false) {
        // show navbar
        if (document.getElementById('navbar').classList.contains('d-none')) {
            document.getElementById('navbar').classList.remove('d-none')
        }
        // show loader
        const spinner = document.getElementById('loader-spinner')
        if (spinner.classList.contains('d-none')) {
            spinner.classList.remove('d-none')
        }
        if(loader.classList.contains('d-none')) {
            loader.classList.remove('d-none')
        }
        const hint = remote.getGlobal('compileHint')
        document.getElementById('loader-hint').innerText = hint
    } else {
        if (!loader.classList.contains('d-none')) {
            loader.classList.add('d-none')
        }
    }
}, 100)