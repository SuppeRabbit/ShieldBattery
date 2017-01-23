// Example config file
// Fill in the correct values for your environment and rename to config.js
// NOTE: you will also need to configure your databases in database.json for db-migrate

const config = {}
config.canonicalHost = 'http://localhost:5555'
config.httpPort = 5555

// Uncomment if this server is behind a reverse proxy that strips SSL, but is
// served over SSL
/*
config.httpsReverseProxy = true
*/

config.sessionSecret = 'shhhhhhh'
config.sessionTtl = 1209600 // in seconds

config.db = {
  connString: require('./database.json').dev
}

config.redis = {
  host: 'localhost',
  port: 6379
}

config.logLevels = {
  file: 'warn',
  console: 'debug'
}

// Uncomment and set your Google Analytics ID to enable analytics reporting
// config.analyticsId = 'UA-000000-01'

// Uncomment and set a url to the feedback page that is shown on the main site
// config.feedbackUrl = 'http://goo.gl/forms/yaV3pAlCdzWEikTL2'

// Uncomment to specify an installer URL, which will be given to clients if their Psi is detected
// to be out of date. If none is specified, no link will be given to clients.
// config.installerUrl = 'https://localhost/installer.msi'

// Settings for rally-point (forwarding servers for use by game players). Two possible options:
// - Use a local server (spun up as a child process), typical for dev
// - Use a set of remote servers, typical for production
config.rallyPoint = {
  secret: 'reallySecretString', // used for both local and remote options
  // Local server option
  local: {
    desc: 'Local',
    address: '::ffff:127.0.0.1', // Address that players will connect to, needs to be ipv6 formatted
    port: 14098,
  },
  // Remote servers option
  /*
  remote: [
    { desc: 'Server One', address: 'rp1.shieldbattery.net', port: 14098 },
    { desc: 'Server Two', address: 'rp2.shieldbattery.net', port: 14098 },
  ],
  */

  // Optional, change where the routeCreator binds to (defaults to binding on everything on a
  // random port)
  /*
  routeCreator: {
    host: '::',
    port: 14099,
  }
  */
}

// Uncomment if you want to utilize emails (requires a mailgun account)
/*
config.mailgun = {
  apiKey: 'key-DEADBEEF',
  domain: 'mg.mydomain.com',
  from: 'ShieldBattery <shieldbattery@mydomain.com>',
}
*/

export default config
