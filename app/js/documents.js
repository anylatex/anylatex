const { ipcRenderer, remote } = require('electron');
const store = remote.getGlobal('store');


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
    }
})()


$('#documents-panel').on('click', (event) => {
    let target = event.target
    var name, documentID
    if (target.id == 'new-documnt') {
        name = $('#new-document-name').val()
        documentID = Math.random().toString(36).substr(2, 9)
        store.createDocument(documentID, name)
    } else {
        name = $('#'+ target.id + 'name').text()
        documentID = target.id
    }
    ipcRenderer.send('set-variable', { name: 'currentDocumentID', value: documentID })
    ipcRenderer.send('set-variable', { name: 'currentDocumentName', value: name })
    ipcRenderer.send('load-page', 'editor')
})