const util = require('util')

class Converter {

    constructor() {
        this.translatedLatex = '%s'
    }

    convert(html) {
        this.translatedLatex = '%s'
        let convertedElements = this._convert_elements(html)
        this.translatedLatex = util.format(this.translatedLatex, convertedElements)
        return this.translatedLatex
    }

    _getParsedDomBodyElements(parsedDom) {
        return parsedDom.children[0].children[1].children
    }

    _into_one_line(str) {
        return str.split('\n').join('')
    }

    _convert_elements(html) {
        var htmlDom = new DOMParser().parseFromString(html, 'text/html')
        var bodyDom = this._getParsedDomBodyElements(htmlDom)
        if (bodyDom.length == 0) {
            // html is pure text
            return html
        }
        var latex = this._into_one_line(html)
        var parsedInnerLatex = ''
        for (let i = 0; i < bodyDom.length; i++) {
            let element = bodyDom[i]
            let elementContent = this._into_one_line(element.textContent)
            let outerHTML = this._into_one_line(element.outerHTML)
            if (element.textContent == '') {
                latex = latex.replace(outerHTML, "")
                continue
            }
            let tagName = element.tagName
            switch (tagName) {
                // Converting Heading
                case 'H1':
                    parsedInnerLatex = `\\section{${elementContent}}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H2':
                    parsedInnerLatex = `\\subsection{${element.textContent}}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'H3':
                    parsedInnerLatex = `\\subsubsection{${element.textContent}}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                // Converting others
                case 'DIV':
                    parsedInnerLatex = `\n${this._convert_elements(element.innerHTML)}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    // latex += this._convert_elements(element.innerHTML) + '\n'
                    break
                case 'P':
                    parsedInnerLatex = `\n${this._convert_elements(element.innerHTML)}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'SPAN':
                    parsedInnerLatex = `${this._convert_elements(element.innerHTML)}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'B':
                    parsedInnerLatex = `\\textbf{${this._convert_elements(element.innerHTML)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'I':
                    parsedInnerLatex = `\\emph{${this._convert_elements(element.innerHTML)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'U':
                    parsedInnerLatex = `\\underline{${this._convert_elements(element.innerHTML)}}`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'UL':
                    parsedInnerLatex = `\\begin{itemize}\n${this._convert_elements(element.innerHTML)}\n\\end{itemize}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'OL':
                    parsedInnerLatex = `\\begin{enumerate}\n${this._convert_elements(element.innerHTML)}\n\\end{enumerate}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'LI':
                    parsedInnerLatex = `\\item ${this._convert_elements(element.innerHTML)}\n`
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
                case 'SPAN':
                    parsedInnerLatex = this._convert_elements(element.innerHTML)
                    latex = latex.replace(outerHTML, parsedInnerLatex)
                    break
            }
        }
        return latex
    }
}

module.exports.Converter = Converter