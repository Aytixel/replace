import {
  GridFSBucket,
  MongoClient,
} from "https://deno.land/x/mongo@v0.29.3/mod.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.9/mod.ts";

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

async function handle(conn: Deno.Conn) {
  for await (const { request, respondWith } of Deno.serveHttp(conn)) {
    const url = new URL(request.url);
    const headers = {
      "content-type": "text/html; charset=UTF-8",
    };
    const status = 200;

    switch (url.pathname) {
      case "/":
        respondWith(
          new Response(await Deno.readFile("./page/index.html"), {
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
          new Response(await current_image.encode(), {
            headers,
            status,
          }),
        ).catch(
          console.error,
        );
    }
  }
}

for await (const conn of server) handle(conn).catch(console.error);

console.log("Server started");
