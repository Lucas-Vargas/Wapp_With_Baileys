import express from "express";
import routes from "./routes.js";
import { reconectSessions, removeDisconnectedSessions } from "./wappFunctions";

const app: any = express();

app.use(express.json());
app.use(routes);

console.log("Reconectando sessões ativas...");
await reconectSessions();

await new Promise(resolve => setTimeout(resolve, 5000));

console.log("Removendo sessões inativas...");
await removeDisconnectedSessions();

app.listen(8010, () => {
    console.log("Servidor rodando na porta 8010");
});
