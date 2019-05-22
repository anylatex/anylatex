const { ipcRenderer, remote, shell } = require('electron')
const store = remote.getGlobal('store')
const path = require('path')
const superagent = require('superagent')


$(function () {
    $("body").niceScroll({
        grabcursorenabled: false
    })
})

    // find all documents
    ; (function () {
        const existedDocuments = store.getExistedDocuments()
        const documentsPanel = document.getElementById('documents-panel')
        let docButtonTemplate = $('#document-template')
        for (const doc of existedDocuments) {
            const { name, id } = doc
            let newDocButton = docButtonTemplate.clone()
            let [buttonEl, nameEl] = newDocButton.children()
            buttonEl.removeAttribute('data-toggle')
            buttonEl.removeAttribute('data-target')
            buttonEl.setAttribute('id', id)
            buttonEl.classList.add('document-button')
            buttonEl.innerHTML = ''
            nameEl.innerText = name
            nameEl.setAttribute('id', id + 'name')
            nameEl.classList.remove('language')
            nameEl.removeAttribute('language-tag')
            newDocButton.attr('id', id + 'panel')
            newDocButton.prependTo(documentsPanel)
            var iframe = document.createElement('iframe')
            iframe.src = path.join(store.dataPath, id, 'document.html')
            iframe.classList.add('frame')
            iframe.setAttribute('scrolling', 'no')
            iframe.setAttribute('frameborder', '0')
            buttonEl.append(iframe)
        }
    })()

// cancel loading animation
document.getElementById('page-loader-container').classList.add('d-none')

// setup HTML language
function setupHTMLLanguage(languageMap) {
    for (const languageEl of document.getElementsByClassName('language')) {
        const languageTag = languageEl.getAttribute('language-tag')
        const result = languageMap[languageTag]
        if (!result) {
            console.log('no corresponding translation of ' + languageTag
                        + ' to ' + remote.getGlobal('currentLanguage'))
        } else {
            languageEl.innerText = result
        }
    }
}
var languageMap = remote.getGlobal('currentLanguageMap')
setupHTMLLanguage(languageMap)

// register context menus
$.contextMenu({
    selector: '.document-button',
    callback: function (key, options) {
        if (key === 'edit') openDocument($(this).get(0))
        else if (key === 'delete') deleteDocument($(this).get(0))
    },
    items: {
        "edit": { name: languageMap['Edit'], icon: "edit" },
        "delete": { name: languageMap['Delete'], icon: "delete" },
    }
})

$('#create-document').on('click', () => {
    const documentName = document.getElementById('new-document-name').value || languageMap['unnamed']
    const documentID = Math.random().toString(36).substr(2, 9)
    store.createDocument(documentID, documentName)
    ipcRenderer.send('set-variable', { name: 'currentDocumentID', value: documentID })
    ipcRenderer.send('set-variable', { name: 'currentDocumentName', value: documentName })
    ipcRenderer.send('load-page', 'editor')
})

let openDocument = (event) => {
    let target = event.target || event
    var name, documentID
    if (target.id == 'new-document' || target.tagName != 'BUTTON') {
        return
    } else {
        name = $('#' + target.id + 'name').text()
        documentID = target.id
        ipcRenderer.send('set-variable', { name: 'currentDocumentID', value: documentID })
        ipcRenderer.send('set-variable', { name: 'currentDocumentName', value: name })
        ipcRenderer.send('load-page', 'editor')
    }
}
$('#documents-panel').on('click', openDocument)

let deleteDocument = (buttonEl) => {
    const id = buttonEl.id
    store.deleteDocument(id)
    document.getElementById(id + 'panel').remove()
}

$('.switch-language').on('click', event => {
    const target = event.target
    const language = target.getAttribute('data')
    ipcRenderer.sendSync('switch-language', language)
    languageMap = remote.getGlobal('currentLanguageMap')
    setupHTMLLanguage(languageMap)
    alert(languageMap['switch-language-hint'])
})

$('#settings-modal').on('show.bs.modal', event => {
    // show current server address
    const apiBase = store.getConfig('apiBase') 
    const hint = languageMap['current server address'] + apiBase
    document.getElementById('input-server-address').setAttribute('placeholder', hint)
    // show user data path
    document.getElementById('user-data-path').value = store.dataPath
})

$('#save-settings-changes').on('click', event => {
    // TODO: check format
    const newApiBase = document.getElementById('input-server-address').value.trim()
    if (newApiBase == store.getConfig('apiBase')) return
    // create an user at server
    superagent
        .post(`${newApiBase}/users`)
        .ok(res => res.status == '201')
        .retry(5)
        .then(res => {
            const userID = res.body.user_id
            console.log('new user id:', userID)
            store.updateUserID(remote.getGlobal('userID'), userID)
            ipcRenderer.sendSync('set-variable', { name: 'userID', value: userID})
            store.setConfig('apiBase', newApiBase)
            store.setConfig('currentUserID', userID)
        })
        .catch(err => {
            console.log(err)
            alert('error: fail to switch server, create user failed')
        })
})

$('#open-data-dir').on('click', event => {
    shell.openItem(store.dataPath)
})