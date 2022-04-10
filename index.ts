import {
  GridFSBucket,
  MongoClient,
} from "https://deno.land/x/mongo@v0.29.3/mod.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.9/mod.ts";
import { compress } from "./compress.ts";
import { v4 } from "https://deno.land/std@0.134.0/uuid/mod.ts";

const client = new MongoClient();

await client.connect({
  db: "image",
  tls: true,
  servers: [
    {
      host: "cluster0-shard-00-00.s8vpt.mongodb.net",
      port: 27017,
    },
    {
      host: "cluster0-shard-00-01.s8vpt.mongodb.net",
      port: 27017,
    },
    {
      host: "cluster0-shard-00-02.s8vpt.mongodb.net",
      port: 27017,
    },
  ],
  credential: {
    username: "user",
    password: "qRUbZmd0CC4oxE9S",
    db: "image",
    mechanism: "SCRAM-SHA-1",
  },
});

const image_database = client.database("image");
const user_database = client.database("user");
const id_collection = user_database.collection("id");
const bucket = new GridFSBucket(image_database);
const image_file_id =
  (await bucket.find({ filename: "current" }).toArray())[0]._id;
const image_file_reader = (await bucket.openDownloadStream(image_file_id))
  .getReader();
let image_file_data = [];
let data;

while (data = (await image_file_reader.read()).value) {
  image_file_data.push([...data]);
}

image_file_data = image_file_data.flat();

const current_image = await Image.decode(image_file_data);
const server = Deno.listen({
  port: 80,
  hostname: "replace.tk",
});
const ws_set = new Set();

async function handle(conn: Deno.Conn) {
  for await (const { request, respondWith } of Deno.serveHttp(conn)) {
    const url = new URL(request.url);

    if (request.headers.get("upgrade") == "websocket") {
      const { socket: ws, response } = Deno.upgradeWebSocket(request);

      ws_set.add(ws);

      ws.addEventListener("open", () => {
        ws.addEventListener("message", async (e) => {
          if (typeof e.data === "string") {
            const split_data = e.data.split(":");
            const command = split_data.shift();

            switch (command) {
              case "register":
                const potential_uuid = split_data.shift();

                if (v4.validate(potential_uuid || "")) {
                  const found_id = await id_collection.findOne({
                    uuid: potential_uuid,
                  });

                  if (found_id) {
                    ws.send(
                      `register:${found_id.uuid}:${found_id.last_update.toISOString()}`,
                    );
                    break;
                  }
                }

                const register_date = new Date();
                const register_uuid = crypto.randomUUID();

                await id_collection.insertOne({
                  last_update: register_date,
                  uuid: register_uuid,
                });

                ws.send(
                  `register:${register_uuid}:${register_date.toISOString()}`,
                );

                break;
            }
          }
        });
      });

      const end = () => {
        ws.close();
        ws_set.delete(ws);
      };

      ws.addEventListener("close", end);
      ws.addEventListener("error", end);

      respondWith(response).catch(
        console.error,
      );
    } else {
      const headers = {
        "content-type": "text/html; charset=UTF-8",
      };
      const status = 200;

      switch (url.pathname) {
        case "/":
          var body = compress(
            request,
            await Deno.readFile("./page/index.html"),
            headers,
          );

          respondWith(
            new Response(body, {
              headers,
              status,
            }),
          ).catch(
            console.error,
          );
          break;
        case "/current.png":
          headers["content-type"] = "image/png";

          var body = compress(
            request,
            await current_image.encode(),
            headers,
          );

          respondWith(
            new Response(body, {
              headers,
              status,
            }),
          ).catch(
            console.error,
          );
      }
    }
  }
}

for await (const conn of server) handle(conn).catch(console.error);

console.log("Server started");
