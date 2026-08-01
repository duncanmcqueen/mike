import { app } from "./app";
import { startLegalMonitorScheduler } from "./lib/legalMonitorScheduler";
import { resolveDeploymentModules } from "./lib/deploymentModules";

const PORT = process.env.PORT ?? 3001;

// Validate the deployment allow-list before opening a listener or starting
// background module work.
resolveDeploymentModules();

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled rejection", reason);
});

const server = app.listen(PORT, () => {
  console.log(`Mike backend running on port ${PORT}`);
});

const stopLegalMonitorScheduler = startLegalMonitorScheduler();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopLegalMonitorScheduler();
    server.close(() => process.exit(0));
  });
}
