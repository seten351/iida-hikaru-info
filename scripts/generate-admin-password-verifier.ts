import { stdin, stdout } from "node:process";

import { createAdminPasswordVerifier } from "../src/server/admin/password";

async function readHidden(prompt: string) {
  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
    throw new Error("This command requires an interactive terminal.");
  }

  stdout.write(prompt);
  stdin.setEncoding("utf8");
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";

    function finish() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    }

    function onData(chunk: string) {
      if (chunk === "\u0003") {
        finish();
        reject(new Error("Cancelled."));
        return;
      }
      if (chunk === "\r" || chunk === "\n") {
        finish();
        resolve(value);
        return;
      }
      if (chunk === "\u007f" || chunk === "\b") {
        value = value.slice(0, -1);
        return;
      }
      if (!chunk.includes("\u001b") && !chunk.includes("\u0000")) {
        value += chunk;
      }
    }

    stdin.on("data", onData);
  });
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error("Password arguments are not accepted. Enter it in the hidden prompt.");
  }

  const password = await readHidden("Admin password: ");
  const confirmation = await readHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");

  const verifier = await createAdminPasswordVerifier(password);
  stdout.write(`${verifier}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  process.stderr.write(`Failed to generate verifier: ${message}\n`);
  process.exitCode = 1;
});
