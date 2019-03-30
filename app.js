const {app, BrowserWindow} = require('electron')
const path = require('path')
const url = require('url')
const request = require('request');
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
  // Create a new window
  window = new BrowserWindow({
    width: 1300,
    height: 900,
    // Set the default background color of the window to match the CSS
    // background color of the page, this prevents any white flickering
    backgroundColor: "#D6D8DC",
    // Don't show the window until it's ready, this prevents any white flickering
    show: false
  })

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
const baseRequest = request.defaults({
    'baseUrl': store.getConfig('apiBase'),
    'json': true
})
global.baseRequest = baseRequest

// get user id, request if not exist
console.log("user id: " + store.getConfig('currentUserID'))
if (!store.getConfig('currentUserID')) {
    baseRequest.post('/users', function(error, response, jsonBody) {
        if (error) {
            console.log(error)
            global.userID = ""
        } else {
            console.log('user id:', jsonBody['user_id'])
            if (!jsonBody['user_id']) {
                console.log('WARN: no user id in response.')
                return
            }
            store.createNewUser(jsonBody['user_id'])
            global.userID = jsonBody['user_id']
        }
    })
} else {
    // read from file
    global.userID = store.getConfig('userID')
}

// variable storing templates
// TODO: store locally
global.templateArgs = {}

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