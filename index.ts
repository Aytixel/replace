import {
  GridFSBucket,
  MongoClient,
} from "https://deno.land/x/mongo@v0.29.3/mod.ts";
import { Image } from "https://deno.land/x/imagescript@v1.2.12/mod.ts";
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

const colors = [
  [109, 0, 26],
  [190, 0, 57],
  [255, 69, 0],
  [255, 168, 0],
  [255, 214, 53],
  [255, 248, 184],
  [0, 163, 104],
  [0, 204, 120],
  [126, 237, 86],
  [0, 177, 111],
  [0, 158, 170],
  [0, 204, 192],
  [36, 80, 164],
  [54, 144, 234],
  [81, 233, 244],
  [73, 58, 193],
  [106, 92, 255],
  [148, 179, 255],
  [129, 30, 159],
  [180, 74, 192],
  [228, 171, 255],
  [222, 16, 127],
  [255, 56, 129],
  [255, 153, 170],
  [109, 72, 47],
  [156, 105, 38],
  [255, 180, 112],
  [0, 0, 0],
  [81, 82, 82],
  [137, 141, 144],
  [212, 215, 217],
  [255, 255, 255],
];
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
let current_encoded_image = new Uint8Array(image_file_data);
let pixel_changes = "";
const server = Deno.listen({
  port: 80,
  hostname: "replace.tk",
});
const ws_set = new Set();

const check_int = (n: string | undefined) => n && !isNaN(parseInt(n));
const change_pixel = (x: number, y: number, color: number) => {
  current_image.bitmap[x * 4 + y * 8000] = colors[color][0];
  current_image.bitmap[x * 4 + y * 8000 + 1] = colors[color][1];
  current_image.bitmap[x * 4 + y * 8000 + 2] = colors[color][2];

  pixel_changes += `::${x}::${y}::${color}`;
};

setInterval(async () => {
  const writer = (await bucket.openUploadStream("current")).getWriter();

  writer.write(current_encoded_image = await current_image.encode());

  await writer.close();

  const files = (await bucket.find({ filename: "current" }).toArray()).sort((
    a,
    b,
  ) => b.uploadDate.getTime() - a.uploadDate.getTime());

  for (let i = 1; i < files.length; i++) bucket.delete(files[i]._id);

  for (const ws of ws_set) {
    if ((ws as WebSocket).readyState === WebSocket.OPEN) {
      (ws as WebSocket).send("other_place" + pixel_changes);
    }
  }

  pixel_changes = "";
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
                        y_number >= 0 && color_number < 32 && color_number >= 0
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
