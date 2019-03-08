const {app, BrowserWindow} = require('electron')
const path = require('path')
const url = require('url')

let window = null

// Wait until the app is ready
app.once('ready', () => {
  // Create a new window
  window = new BrowserWindow({
    // Set the initial width to 800px
    width: 800,
    // Set the initial height to 600px
    height: 600,
    // Set the default background color of the window to match the CSS
    // background color of the page, this prevents any white flickering
    backgroundColor: "#D6D8DC",
    // Don't show the window until it's ready, this prevents any white flickering
    show: false
  })

  // Load a URL in the window to the local index.html path
  window.loadURL(url.format({
    pathname: path.join(__dirname, 'app/editor.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Show window when page is ready
  window.once('ready-to-show', () => {
    window.show()
  })
})


const config = require("./config.json")
console.log("api: " + config.api)
global.apiBase = config.api
global.currentCompilingTask = ""

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
    }
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
        let child = new BrowserWindow({parent: window, modal: true, show: true});
        child.loadURL(url.format({
            pathname: path.join(__dirname, "app/pdfviewer.html"),
            protocol: "file:",
            slashes: true
        }))
    }
})