"use strict";
import * as vscode from "vscode";
import * as path from "path";
import { init, localize } from "vscode-nls-i18n";
const StaticServer = require("static-server");
const getPort = require("get-port");
const ip = require("internal-ip");
const contentDisposition = require("content-disposition");

let currentServer: any = null;
let statusbar: vscode.StatusBarItem;

async function updateContext(val: string | void) {
  await vscode.commands.executeCommand(
    "setContext",
    "staticServerFolderPath",
    val
  );
}

export async function activate(context: vscode.ExtensionContext) {
  init(context);
  statusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

  async function close() {
    if (currentServer) {
      currentServer.stop();
      currentServer = null;
    }
    statusbar.hide();
    await updateContext(undefined);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("static-server.close", close)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "static-server.serve",
      async (uri: vscode.Uri) => {
        const configuration = vscode.workspace.getConfiguration(
          "static-server"
        );
        const port = configuration.get("port") || (await getPort()) || 1337;
        const host = await ip.v4();

        const server = new StaticServer({
          rootPath: uri.fsPath, // required, the root of the server file tree
          port, // required, the port to listen
          name: "vscode-static-server", // optional, will set "X-Powered-by" HTTP header
          host: "0.0.0.0", // optional, defaults to any interface
          cors: "*", // optional, defaults to undefined
          followSymlink: true // optional, defaults to a 404 error
        });

        await new Promise((resolve, reject) => {
          server.start((err: Error) => {
            err ? reject(err) : resolve();
          });
        });

        server.on("request", (req: any, res: any) => {
          if (configuration.get("download")) {
            res.setHeader("Content-disposition", contentDisposition(req.path));
          }
        });

        await updateContext(uri.fsPath);

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

        if (!workspaceFolder) {
          return;
        }

        const relativePath = path.relative(
          workspaceFolder.uri.fsPath,
          uri.fsPath
        );

        const fullUrl = "http://" + host + ":" + port;

        vscode.window.showInformationMessage(
          localize("info.server.on", relativePath, fullUrl)
        );

        currentServer = server;

        statusbar.text = `$(radio-tower) ${localize(
          "status.server.on"
        )}: ${port}`;
        statusbar.tooltip = localize("status.server.tooltip", fullUrl);
        statusbar.show();
        statusbar.command = "static-server.close";
      }
    )
  );
}

// this method is called when your extension is deactivated
export async function deactivate(context: vscode.ExtensionContext) {
  if (statusbar) {
    statusbar.dispose();
  }
  if (currentServer) {
    currentServer.stop();
  }

  await updateContext(undefined);

  for (const subscription of context.subscriptions) {
    subscription.dispose();
  }
}
