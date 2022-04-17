import { MongoClient } from "https://deno.land/x/mongo@v0.29.3/mod.ts";
import { Image } from "https://deno.land/x/imagescript@v1.2.12/mod.ts";

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
  [0, 117, 111],
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
const pixel_collection = image_database.collection("pixel");

const image = await Image.decode(await Deno.readFile("original.png"));

for (let y = 0; y < 2000; y++) {
  const array = [];

  for (let x = 0; x < 2000; x++) {
    for (let i = 0; i < 32; i++) {
      if (
        colors[i][0] == image.bitmap[x * 4 + y * 8000] &&
        colors[i][1] == image.bitmap[x * 4 + y * 8000 + 1] &&
        colors[i][2] == image.bitmap[x * 4 + y * 8000 + 2]
      ) {
        array.push({ _id: x + y * 2000, color: i });
        break;
      }
    }
  }

  await pixel_collection.insertMany(array);
}
