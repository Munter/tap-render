var PauseStream = require("pause-stream")
var json = typeof JSON === "object" ? JSON : require("jsonify")

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

        if (result.ok) {
            stream.pass++
        } else if (result.skip) {
            stream.skip++
        } else if (stream.todo) {
            stream.todo++
        } else {
            stream.fail++
        }
    }
}

function handleEnd(stream) {
    results = []
    processCount = 0

    stream.write("\n1.." + stream.count + "\n")
    stream.write("# tests " + stream.count + "\n")
    stream.write("# pass  " + stream.pass + "\n")

    if (stream.fail > 0) {
        stream.write("# fail  " + stream.fail + "\n")
    }
    if (stream.skip > 0) {
        stream.write("# skip  " + stream.skip + "\n")
    }
    if (stream.todo > 0) {
        stream.write("# todo  " + stream.todo + "\n")
    }

    stream.write("\n# ok\n")
}

function encodeResult(result, count) {
    var output = ""
    output += (result.ok ? "ok " : "not ok ") + count
    output += result.name ? " " +
        result.name.replace(/\s+/g, " ") : ""

    if (result.skip) {
        output += " # SKIP"
    } else if (result.todo) {
        output += " # TODO"
    }

    output += "\n"

    if (!result.ok) {
        output += encodeError(result)
    }

    return output
}

function encodeError(result) {
    var output = ""
    var outer = "  "
    var inner = outer + "  "
    output += outer + "---\n"
    output += inner + "operator: " + result.operator + "\n"

    var expected = json.stringify(result.expected, null, "  ") || ""
    var actual = json.stringify(result.actual, null, "  ") || ""

    if (Math.max(expected.length, actual.length) > 65) {
        expected = expected.replace(/\n/g, "\n" + inner + "  ")
        actual = actual.replace(/\n/g, "\n" + inner + "  ")

        output += inner + "expected:\n" + inner + "  " + expected + "\n"
        output += inner + "actual:\n" + inner + "  " + actual + "\n"
    } else {
        output += inner + "expected: " + expected + "\n"
        output += inner + "actual:   " + actual + "\n"
    }

    if (result.at) {
        output += inner + "at: " + result.at + "\n"
    }

    if (result.operator === "error" && result.actual &&
        result.actual.stack
    ) {
        var lines = String(result.actual.stack).split("\n")
        output += inner + "stack:\n"
        output += inner + "  " + lines[0] + "\n"
        for (var i = 1; i < lines.length; i++) {
            output += inner + lines[i] + "\n"
        }
    }

    output += outer + "...\n"

    return output
}
