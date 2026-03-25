import { createServer } from "node:net";

export function findFreePort(startPort: number = 7377): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, "0.0.0.0", () => {
      const addr = server.address();
      const port =
        typeof addr === "object" && addr !== null ? addr.port : startPort;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      // Port in use, try next
      findFreePort(startPort + 1).then(resolve).catch(reject);
    });
  });
}
