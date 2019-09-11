exports.existy = val => val != null

// Async sleep.  A whole new WORLD!
exports.sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

exports.unixNow = () => Math.floor(new Date() / 1000)
