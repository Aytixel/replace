import { MongoClient } from "https://deno.land/x/mongo@v0.29.3/mod.ts";
import { v4 } from "https://deno.land/std@0.134.0/uuid/mod.ts";
import { compress } from "./compress.ts";
import { colors, download } from "./download.ts";

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
const pixel_collection = image_database.collection("pixel");
const id_collection = user_database.collection("id");
const current_image = await download();
let current_encoded_image = await current_image.encode();
let pixel_changes = "";
let db_pixel_changes: number[][] = [];
const server = Deno.listenTls({
  port: 80,
  hostname: "replace.tk",
  certFile: "cert/ssl/cert.pem",
  keyFile: "cert/ssl/privkey.pem",
  alpnProtocols: ["h2", "http/1.1"],
} as any);
const ws_set = new Set();

const check_int = (n: string | undefined) => n && !isNaN(parseInt(n));
const change_pixel = (x: number, y: number, color: number) => {
  current_image.bitmap[x * 4 + y * 8000] = colors[color][0];
  current_image.bitmap[x * 4 + y * 8000 + 1] = colors[color][1];
  current_image.bitmap[x * 4 + y * 8000 + 2] = colors[color][2];
  current_image.bitmap[x * 4 + y * 8000 + 3] = 255;

  if (!db_pixel_changes[color]) db_pixel_changes[color] = [];

  db_pixel_changes[color].push(x + y * 2000);
  pixel_changes += `::${x}::${y}::${color}`;
};

// broadcast pixel changes
setInterval(async () => {
  for (const ws of ws_set) {
    if ((ws as WebSocket).readyState === WebSocket.OPEN) {
      (ws as WebSocket).send("other_place" + pixel_changes);
    }
  }

  for (let i = 0; i < 32; i++) {
    if (db_pixel_changes[i]) {
      pixel_collection.updateMany({ _id: { $in: db_pixel_changes[i] } }, {
        $set: { color: i },
      }).catch(console.error);
    }
  }

  current_encoded_image = await current_image.encode();
  pixel_changes = "";
  db_pixel_changes = [];
}, 1000);

async function handle(conn: Deno.Conn) {
  for await (const { request, respondWith } of Deno.serveHttp(conn)) {
    const url = new URL(request.url);

    if (request.headers.get("upgrade") == "websocket") {
      const { socket: ws, response } = Deno.upgradeWebSocket(request);

      ws_set.add(ws);

      ws.onopen = () => {
        ws.onmessage = async (e: MessageEvent) => {
          if (typeof e.data === "string") {
            const split_data = e.data.split("::");
            const command = split_data.shift();

            try {
              switch (command) {
                case "register":
                  var potential_uuid = split_data.shift();

                  if (v4.validate(potential_uuid || "")) {
                    const query = await id_collection.findOne({
                      uuid: potential_uuid,
                    });

                    if (query) {
                      ws.send(
                        `register::${query.uuid}::${query.last_update.toISOString()}`,
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
                    `register::${register_uuid}::${register_date.toISOString()}`,
                  );
                  break;
                case "place":
                  var potential_uuid = split_data.shift();

                  if (v4.validate(potential_uuid || "")) {
                    const update = new Date();
                    const query = await id_collection.findOne({
                      uuid: potential_uuid,
                    });
                    const x = split_data.shift();
                    const y = split_data.shift();
                    const color = split_data.shift();

                    if (
                      query &&
                      (update.getTime() - query.last_update.getTime()) >
                        300000 &&
                      check_int(x) && check_int(y) && check_int(color)
                    ) {
                      const x_number = parseInt(x || "");
                      const y_number = parseInt(y || "");
                      const color_number = parseInt(color || "");

                      if (
                        x_number < 2000 && x_number >= 0 && y_number < 2000 &&
                        y_number >= 0 && color_number < 32 &&
                        color_number >= 0
                      ) {
                        await id_collection.updateOne({
                          uuid: potential_uuid,
                        }, {
                          $set: { last_update: update },
                        });

                        change_pixel(x_number, y_number, color_number);

                        ws.send(
                          `place::${update}::${x_number}::${y_number}::${color_number}`,
                        );
                        break;
                      }
                    }
                  }

                  ws.send(`place`);
                  break;
              }
            } catch (error) {
              console.error(error);
            }
          }
        };
      };

      const end = () => {
        ws.close();
        ws_set.delete(ws);
      };

      ws.onclose = end;
      ws.onerror = end;

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
            await Deno.readFile("./page/index_minified.html"),
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

          respondWith(
            new Response(current_encoded_image, {
              headers,
              status,
            }),
          ).catch(
            console.error,
          );
          break;
        default:
          respondWith(new Response(null, { status: 404 })).catch(
            console.error,
          );
      }
    }
  }
}

console.log("Server started");

for await (const conn of server) handle(conn).catch(console.error);
