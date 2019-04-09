const { ipcRenderer, remote } = require('electron');
const store = remote.getGlobal('store');
const path = require('path');


(function(){
    const existedDocuments = store.getExistedDocuments()
    const documentsPanel = document.getElementById('documents-panel')
    let docButtonTemplate = $('#document-template')
    for (const doc of existedDocuments) {
        const { name, id } = doc
        let newDocButton = docButtonTemplate.clone()
        let [ buttonEl, nameEl ] = newDocButton.children()
        buttonEl.removeAttribute('data-toggle')
        buttonEl.removeAttribute('data-target')
        buttonEl.setAttribute('id', id)
        buttonEl.innerHTML = ''
        nameEl.innerText = name
        nameEl.setAttribute('id', id+'name')
        newDocButton.prependTo(documentsPanel)
        var iframe = document.createElement('iframe')
        iframe.src = path.join(store.dataPath, id, 'document.html')
        iframe.classList.add('w-100')
        iframe.classList.add('h-100')
        iframe.setAttribute('scrolling', 'no')
        iframe.setAttribute('frameborder', '0')
        buttonEl.append(iframe)
    }
})()

$('#create-document').on('click', () => {
    const documentName = document.getElementById('new-document-name').value || "unnamed"
    const documentID = Math.random().toString(36).substr(2, 9)
    store.createDocument(documentID, documentName)
    ipcRenderer.send('set-variable', { name: 'currentDocumentID', value: documentID })
    ipcRenderer.send('set-variable', { name: 'currentDocumentName', value: documentName })
    ipcRenderer.send('load-page', 'editor')
})

$('#documents-panel').on('click', (event) => {
    let target = event.target
    var name, documentID
    if (target.id == 'new-document' || target.tagName != 'BUTTON') {
        return
    } else {
        name = $('#'+ target.id + 'name').text()
        documentID = target.id
        ipcRenderer.send('set-variable', { name: 'currentDocumentID', value: documentID })
        ipcRenderer.send('set-variable', { name: 'currentDocumentName', value: name })
        ipcRenderer.send('load-page', 'editor')
    }
})