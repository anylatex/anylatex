const {app, BrowserWindow} = require('electron')
const path = require('path')
const url = require('url')
const superagent = require('superagent')
const Store = require("./app/js/store")

let window = null
const store = new Store({
    configName: 'anylatex-config',
    defaults: {
        apiBase: 'http://latex.0x7cc.com/api',
        currentUserID: ''
    }
})
global.store = store

// Wait until the app is ready
app.once('ready', () => {

    // get user id, request if not exist
    console.log("user id: " + store.getConfig('currentUserID'))
    if (!store.getConfig('currentUserID')) {
        superagent
            .post(`${store.getConfig('apiBase')}/users`)
            .ok(res => res.status == '201')
            .retry(5)
            .then(res => {
                const userID = res.body.user_id
                console.log('user id:', userID)
                store.createNewUser(userID)
                global.userID = userID
            })
            .catch(err => {
                console.log(err)
                global.userID = ""
            })
    } else {
        // read from file
        global.userID = store.getConfig('currentUserID')
    }

  // Create a new window
  window = new BrowserWindow({
    // Set the default background color of the window to match the CSS
    // background color of the page, this prevents any white flickering
    backgroundColor: "#D6D8DC",
    // Don't show the window until it's ready, this prevents any white flickering
    show: false
  })

  window.maximize()
  window.setResizable(false)
  window.on('unmaximize', () => window.maximize())

  // Load a URL in the window to the local index.html path
  window.loadURL(url.format({
    pathname: path.join(__dirname, 'app/documents.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Show window when page is ready
  window.once('ready-to-show', () => {
    window.show()
  })
})

// setup base request with api base setted and json option enabled
console.log("api: " + store.getConfig('apiBase'))


// variable storing templates
global.templateArgs = store.getConfig('templateArgs', {})
global.defaultTemplateName = store.getConfig('defaultTemplateName', '')
superagent
    .get(`${store.getConfig('apiBase')}/templates`)
    .ok(res => res.status == '200')
    .retry(3)
    .then(res => {
        parseTemplates(res.body)
    })
    .catch(err => {
        console.log('WARN: templates not fetched\n' + err)
    })

// TODO: log updates if existed templates' arguments changed
function parseTemplates(jsonBody) {
    let templateNames = Object.keys(jsonBody)
    for (let i = 0; i < templateNames.length; i++) {
        let templateName = templateNames[i]
        if (templateName == 'default') {
            global.defaultTemplateName = jsonBody.default
            continue
        }
        let { headings, args, part_args: partArgs } = jsonBody[templateName]
        if (!headings) {
            headings = ['section', 'subsection', 'subsubsection']
        }
        global.templateArgs[templateName] = {
            headings: headings,
            args: args,
            partArgs: partArgs
        }
    }
    store.setConfig('templateArgs', global.templateArgs)
    store.setConfig('defaultTemplateName', global.defaultTemplateName)
    console.log('Parsed templates:', Object.keys(global.templateArgs))
}

global.currentCompilingTask = ""

// variables storing current the edidting document
global.currentDocumentID = ""
global.currentDocumentName = ""

const { ipcMain } = require("electron")

ipcMain.on("alert", (event, arg) => {
    console.log(arg)
    event.returnValue = 'pong'
})

ipcMain.on("load-page", (event, arg) => {
    console.log("load page:", arg)
    if (arg == "editor") {
        window.loadURL(url.format({
            pathname: path.join(__dirname, "app/editor.html"),
            protocol: "file:",
            slashes: true
        }))
    } else if (arg == "documents") {
        window.loadURL(url.format({
            pathname: path.join(__dirname, "app/documents.html"),
            protocol: "file:",
            slashes: true
        }))
    }
})

// set up variables
ipcMain.on("set-variable", (event, arg) => {
    console.log('set variable:', arg.name)
    global[arg.name] = arg.value
    event.returnValue = "done"
})

// add a compile task
ipcMain.on("add-task", (event, arg) => {
    console.log("add task:", arg)
    global.currentCompilingTask = arg
    event.returnValue = "done"
})

// pop up a page
ipcMain.on("pop-page", (event, arg) => {
    if (arg == "pdfviewer") {
        let child = new BrowserWindow({
            parent: window,
            width: 800,
            height: 900,
            modal: true,
            show: true
        });
        child.loadURL(url.format({
            pathname: path.join(__dirname, "app/pdfviewer.html"),
            protocol: "file:",
            slashes: true
        }))
    }
})