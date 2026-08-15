#!/usr/bin/env node
const fs = require("fs")
const path = require("path")
const os = require("os")

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".config", "opencode")

function log(line) {
  console.log(line)
}

log("")
log("Welcome to the opencode-token-usage installer!")
log("")

const configDir = process.env.OPENCODE_CONFIG_DIR || GLOBAL_CONFIG_DIR
const pluginsDir = path.join(configDir, "plugins")
const commandsDir = path.join(configDir, "command")

const sourcePlugin = path.join(__dirname, "..", "plugin", "opencode-token-usage.ts")
const sourceCommand = path.join(__dirname, "..", "command", "token-usage.md")

function copyFile(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Source file not found: ${src}`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

try {
  copyFile(sourcePlugin, path.join(pluginsDir, "opencode-token-usage.ts"))
  log(`Copied plugin  -> ${path.join(pluginsDir, "opencode-token-usage.ts")}`)

  copyFile(sourceCommand, path.join(commandsDir, "token-usage.md"))
  log(`Copied command -> ${path.join(commandsDir, "token-usage.md")}`)

  log("")
  log("Register the plugin in your config (e.g. ~/.config/opencode/opencode.json):")
  log(`  "plugin": ["file:///${pluginsDir.replace(/\\/g, "/")}/opencode-token-usage.ts"]`)
  log("")
  log("Restart opencode, then each completed main-agent reply shows a token badge.")
  log("")
} catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}
