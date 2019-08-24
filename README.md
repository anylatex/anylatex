# Introduction

Anylatex is an editor for anyone who want to write professional-looking documents but don’t know how to use LaTeX. 

Anylatex provides a [WYSIWYM][1] editor for writing and a preview window to show the result document. It combines the advantages of LaTeX with the ease of use of a graphical interface. With Anylatex, users can focus on documents’ content rather than formats.

Anylatex is designed to write small-to-medium documents like reports, articles or resumes. It now support following major features:
- compiling on cloud and rendering pdf locally 
- formatting texts: bold, italic, underline, left align, right align, center align
- inserting images, tables and lists(ordered or unordered)
- inserting references(using bibtex)
- inserting equations(using [asciimath][2] or buttons)
- support cross reference of images, equations, tables and chapters

# How to use

## Download the application
Electron is used to build this editor to support various platforms. Different versions can be downloaded [here][3].

## Setup the server address
When first entering the editor, users should setup the server address in `settings`.
Compiling documents need a server running compiling services. Users can use the public server `http://latex.0x7cc.com/api` or set up one follow the instruction in this [repository][4].

# About data storage

After setting up the server address in the first time, the server will create a new user for the editor. However, all documents is saved in local and the user identity is only used for the server to verify and identify all requests sent from editor.

[1]:	https://en.wikipedia.org/wiki/WYSIWYM
[2]:	http://asciimath.org
[3]:	https://github.com/anylatex/anylatex/releases
[4]:	https://github.com/anylatex/backend