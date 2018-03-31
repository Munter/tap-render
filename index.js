var PauseStream = require("pause-stream")
var yaml = require('js-yaml');
var indent = require('indent-string');

// Keep a counter of all running Render's and a list of their
// results
var running = 0
var processCount = 0
var results = []

module.exports = Render

function Render(opts) {
    var stream = PauseStream()
    stream.readable = true
    stream.count = 0
    stream.fail = 0
    stream.pass = 0
    stream.skip = 0
    stream.todo = 0
    var began = false

    opts = opts || {}
    var force = opts.force

    var _pipe = stream.pipe
    stream.pipe = pipe
    stream.begin = begin
    stream.push = push
    stream.close = close

    return stream

    function pipe() {
        stream.piped = true
        return _pipe.apply(this, arguments)
    }

    function begin() {
        var first = running === 0

        if (!force) {
            running++
        }

        began = true

        if (first || force) {
            stream.write("TAP version 13\n")
        }
    }

    function push(t, result) {
        if (t && t.name) {
            stream.write("# " + t.name + "\n")
        }

        if (result) {
            handleResult(result)
        }

        if (t && t.on) {
            t.on("result", handleResult)
        }
    }

    function close() {
      var result = {
            count: stream.count
            , pass: stream.pass
            , fail: stream.fail
            , skip: stream.skip
            , todo: stream.todo
        }

        results.push(result)

        if (!force && began) {
            running--
        }

        if (running === 0 || force) {
            handleEnd(stream)
        }

        stream.end()

        return result;
    }

    function handleResult(result) {
        if (typeof result === "string") {
            stream.write("# " + result + "\n")
            return
        }

        stream.count++

        if (!force) {
            processCount++
        }
        var count = force ? stream.count : processCount

        stream.write(encodeResult(result, count))

        if (result.skip) {
            stream.skip++
        } else if (result.ok) {
            stream.pass++
        } else if (result.todo) {
            stream.todo++
        } else {
            stream.fail++
        }
    }
}

function handleEnd(stream) {
    var count = 0
    var skip = 0
    var pass = 0
    var todo = 0
    var fail = 0

    for (var i = 0; i < results.length; i++) {
        var result = results[i]
        count += result.count
        skip += result.skip
        pass += result.pass
        todo += result.todo
        fail += result.fail
    }

    results = []
    processCount = 0

    stream.write("\n1.." + count + "\n")
    stream.write("# tests " + count + "\n")

    if (stream.skip > 0) {
        stream.write("# skip  " + skip + "\n")
    }

    stream.write("# pass  " + pass + "\n")

    if (todo > 0) {
        stream.write("# todo  " + todo + "\n")
    }

    if (fail > 0) {
        stream.write("# fail  " + fail + "\n")
    } else {
      stream.write("\n# ok\n")
    }
}

function encodeResult(result, count) {
    var output = ""
    output += (result.ok ? "ok " : "not ok ") + count
    output += result.name ? " " +
        result.name.replace(/\s+/g, " ") : ""

    if (result.skip) {
        output += " # SKIP";

        if (typeof result.skip === 'string') {
          output += " " + result.skip
        }
    } else if (result.todo) {
        output += " # TODO";

        if (typeof result.todo === 'string') {
          output += " " + result.todo
        }
    }

    output += "\n"

    if (!result.ok) {
        output += encodeError(result)
    }

    return output
}

function encodeError({ operator, expected, actual, at }) {
    var yamlOptions = {
      lineWidth: -1
    };
    var orderedResult = {};

    if (operator) { orderedResult.operator = operator; }
    if (expected) { orderedResult.expected = expected; }
    if (actual) { orderedResult.actual = actual; }
    if (at) { orderedResult.at = at; }

    var dump = yaml.safeDump(orderedResult, yamlOptions)
      .replace('actual: ', 'actual:   ')
      .replace('at: ', 'at:       ');

    return '  ---\n' + indent(dump, 4) + '  ...\n';
}
