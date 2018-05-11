const request  = require('request')
const cheerio  = require('cheerio')
const debug    = require('debug')('scanner')
const fs       = require('fs')
const beautify = require('js-beautify').js
const dns      = require('dns')
const chalk    = require('chalk')
const {spawn}  = require ('child_process');

if (!process.argv[2])
  console.log('Please, provide a URL to scan')

const BASE_URL = process.argv[2]

function checkAvailbility (domain, callback) {
  //uses the core modules to run an IPv4 resolver that returns 'err' on error
  dns.resolve4( domain, function (err, addresses) {
    callback(err ? true: false)
  })
}

function mkdir (dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath)
    } catch(e) {
      mkdir(path.dirname(dirPath))
      mkdir(dirPath)
    }
  }
}

function saveFile (script, filename) {
  fs.writeFile('results/' + filename, script, function (err) {
    if (err) return console.trace(err)
  })
}

function detectVendor (script, filename) {
  var vendor
  if (vendor = script.match(/AngularJS/))
    log(filename, 'angular detected! ' + vendor)

  if (vendor = script.match(/jQuery v\d+\.\d+.\d+/))
    log(filename, 'jquery detected! ' + vendor[0])
}

function detectDomains (script, filename) {
  var domains = []
  var source = script.split('\\n')

  source.forEach(function (line, index) {
    var results = script.match(/[a-z0-9]+?\.?[a-z0-9]+\.(com|net|br|org|io)[^\w]/)
    let domain = results ? results[0].replace(/\)|\/|\r\n\t|\n|\r\t/, '') : undefined

    if (domain && domains.indexOf(domain) == -1)
      domains.push(domain)
  })

  domains.forEach(function (domain, index) {
    log(filename, 'Possible domain found! ' + domain)
  })
}

function detectTemplate (script, filename) {
  var line = script.match(/\{\{/)
  if (line) log(filename, line)
}

function detectBase64 (script, filename) {
  // Detect base64 (to check)
  if (script.match(/^([A-Za-z0-9+\/]{4})*([A-Za-z0-9+\/]{4}|[A-Za-z0-9+\/]{3}=|[A-Za-z0-9+\/]{2}==)$/))
    log(filename, 'Possible base64 value found!')
}

function log (filename, msg) {
  console.log(chalk.gray(filename) + ': ' + msg)
}

function detectDangerousFunctions (script, filename) {

  // TODO: Refactor
  // Detect eval (to check)
  if (script.match(/eval\(/)) {

    var cmd  = 'grep -A 3 -B 3 -n --color -i "eval\(" results/' + filename
    const p = spawn (cmd, [], {shell: true});
    p.stdout.on('data', data => {
      log(filename, 'EVAL detected')
      console.log(data.toString())
    });
  }

  if (script.match(/html\(/))
    log(filename, '$.html detected')

  if (script.match(/jsonp\(/))
    log(filename, 'jsonp detected')

  if (script.match(/innerHTML\(/))
    log(filename, 'innerHTML detected')

  if (script.match(/outerHTML\(/))
    log(filename, 'outerHTML detected')

  if (script.match(/document.write\(/))
    log(filename, 'document.write detected')

  if (script.match(/append\(/))
    log(filename, 'append detected')

  if (script.match(/localStorage\(/))
    log(filename, 'localStorage detected')
}

function detectIp (script, filename) {
  var ip = script.match(/([0-9]{1,3}[\.]){3}[0-9]{1,3}/)
  if (ip) log(filename, 'Possible IP address found: ' + ip[0])
}

function detectEndpoints (script, filename) {
  var e = script.match(/url: ["|'](.*)$/)
  if (e) console.log('endpoint', e)
}

function downloadJavaScript (path) {

  var base;
  if (BASE_URL.substr(-1) != '/')
    base = BASE_URL.concat('/')
  else
    base = BASE_URL

  var url = path.match(/http:|https:/) ? path : base + path
  url = url.replace(/([^:]\/)\/+/g, '$1')

  var domain = url.split('/')[2]

  // check if domain is registered
  checkAvailbility(domain, function (available) {
    if (available)
      console.log(domain, ' is probably available!')
  })

  request(url, function (err, response, body) {

    var chunks = path.split('/')
    var filename = chunks[chunks.length-1]

    if (err)
      return console.trace(err)

    if (!body)
      return console.log('EMPTY')

    var script = beautify(body, { ident_size: 2, space_in_empty_parent: true })

    detectDangerousFunctions(script, filename)

    detectBase64(script, filename)

    detectVendor(script, filename)

    detectDomains(script, filename)

    detectTemplate(script, filename)

    detectIp(script, filename)

    detectEndpoints(script, filename)

    saveFile(script, filename)

    /*
     * TODO: Check requesting JavaScript with and without cookie
     * compare file sizes
     */
  })
}

request(BASE_URL, function (err, response, body) {
  if (!body)
    return console.log('No response')

  mkdir('results')

  cheerio.load(body)('script').each(function (index, tag) {
    if (!tag.attribs.src) return
    downloadJavaScript(tag.attribs.src)
  })
})
