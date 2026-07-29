import { app } from "./app";

const PORT = process.env.PORT ?? 3001;

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled rejection", reason);
});

app.listen(PORT, () => {
  console.log(`Mike backend running on port ${PORT}`);
});
