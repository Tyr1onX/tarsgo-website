import assert from "node:assert/strict";
import test from "node:test";

import { uploadConfig, uploadPlugin } from "@milkdown/kit/plugin/upload";
import { schemaCtx } from "@milkdown/kit/core";
import { Fragment, Schema, Slice } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import { Decoration } from "@milkdown/kit/prose/view";
import {
  bindCommunityClipboardImages,
  communityEnableHtmlFileUploader,
  matchCommunityClipboardImageFiles,
  removeUnpersistableCommunityClipboardImages,
} from "./community-image-paste.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    image: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { src: {}, alt: { default: "" }, title: { default: "" } },
    },
  },
  marks: { strong: {} },
});

function imageNames(slice) {
  const names = [];
  slice.content.descendants((node) => {
    if (node.type === schema.nodes.image) names.push(node.attrs.alt);
  });
  return names;
}

test("rich clipboard binding preserves text and marks while attaching files to image nodes", () => {
  const firstImage = schema.nodes.image.create({ src: "blob:clipboard/one", alt: "one" });
  const secondImage = schema.nodes.image.create({ src: "data:image/png;base64,AAAA", alt: "two" });
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.text("before "),
    firstImage,
    schema.text(" emphasized", [schema.marks.strong.create()]),
    secondImage,
    schema.text(" after"),
  ]);
  const original = new Slice(Fragment.from(paragraph), 0, 0);
  const files = [new File(["one"], "one.png", { type: "image/png" }), new File(["two"], "two.png", { type: "image/png" })];
  let nextToken = 0;

  const result = bindCommunityClipboardImages(original, schema.nodes.image, files, (file, source) =>
    schema.nodes.image.create({ ...source.attrs, src: `community-upload://token-${++nextToken}`, alt: file.name }),
  );

  assert.deepEqual(imageNames(result.slice), ["one.png", "two.png"]);
  assert.deepEqual(result.extraFiles, []);
  const resultParagraph = result.slice.content.firstChild;
  assert.equal(resultParagraph.textContent, "before  emphasized after");
  assert.equal(resultParagraph.child(2).marks[0].type.name, "strong");
  assert.equal(resultParagraph.child(1).attrs.src, "community-upload://token-1");
  assert.equal(resultParagraph.child(3).attrs.src, "community-upload://token-2");
});

test("unpersistable clipboard images are removed without dropping surrounding rich text", () => {
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.text("before "),
    schema.nodes.image.create({ src: "blob:clipboard/image", alt: "local" }),
    schema.text(" middle "),
    schema.nodes.image.create({ src: "https://example.test/image.png", alt: "remote" }),
    schema.text(" after"),
  ]);
  const result = removeUnpersistableCommunityClipboardImages(new Slice(Fragment.from(paragraph), 0, 0), schema.nodes.image);

  assert.equal(result.removed, 1);
  assert.deepEqual(imageNames(result.slice), ["remote"]);
  assert.equal(result.slice.content.firstChild.textContent, "before  middle  after");
});

test("clipboard files bind to local image nodes before unrelated remote images", () => {
  const file = new File(["image"], "copied.png", { type: "image/png" });
  const result = matchCommunityClipboardImageFiles([
    "https://example.test/remote.png",
    "blob:clipboard/copied-image",
  ], [file]);

  assert.equal(result.assignments.get(1), file);
  assert.equal(result.assignments.has(0), false);
  assert.deepEqual(result.extraFiles, []);
});

test("cleanup preserves blob URLs created by the current paste upload", () => {
  const file = new File(["image"], "copied.png", { type: "image/png" });
  const slice = new Slice(Fragment.from(schema.nodes.paragraph.create(null, [
    schema.nodes.image.create({ src: "data:image/png;base64,AAAA", alt: "copied" }),
  ])), 0, 0);
  const stagedUrl = "blob:https://editor.test/staged-upload";
  const bound = bindCommunityClipboardImages(slice, schema.nodes.image, [file], () =>
    schema.nodes.image.create({ src: stagedUrl, alt: file.name }),
  );
  const result = removeUnpersistableCommunityClipboardImages(bound.slice, schema.nodes.image, (source) => source === stagedUrl);

  assert.equal(result.removed, 0);
  assert.deepEqual(imageNames(result.slice), ["copied.png"]);
  assert.equal(result.slice.content.firstChild.firstChild.attrs.src, stagedUrl);
});

async function createUploadPlugin(enableHtmlFileUploader, onUpload) {
  const config = {
    uploader: onUpload,
    enableHtmlFileUploader,
    uploadWidgetFactory: (position, spec) => Decoration.widget(position, () => null, spec),
  };
  const context = {
    get(key) {
      if (key === schemaCtx) return schema;
      if (key === uploadConfig.key) return config;
      throw new Error("Unexpected Milkdown context key");
    },
    wait: async () => undefined,
    update: () => undefined,
  };
  await uploadPlugin(context)();
  return uploadPlugin.plugin();
}

test("Milkdown 7.23 HTML paste bypasses upload unless the app enables its HTML file uploader", async () => {
  const file = new File(["image"], "clipboard.png", { type: "image/png" });
  const fileList = Object.assign([file], { item(index) { return this[index] ?? null; } });
  const previousClipboardEvent = globalThis.ClipboardEvent;
  const previousDragEvent = globalThis.DragEvent;
  globalThis.ClipboardEvent = class ClipboardEvent extends Event {
    constructor(clipboardData) {
      super("paste");
      this.clipboardData = clipboardData;
    }
  };
  globalThis.DragEvent = class DragEvent extends Event {};

  async function tryPaste(enableHtmlFileUploader) {
    let uploadCalls = 0;
    const plugin = await createUploadPlugin(enableHtmlFileUploader, async (files) => {
      uploadCalls += 1;
      return schema.nodes.image.create({ src: "community-upload://test-token", alt: files[0].name });
    });
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph", null, [schema.text("text")])]),
      plugins: [plugin],
    });
    const view = {
      state,
      dispatch(transaction) { this.state = this.state.apply(transaction); },
    };
    const event = new globalThis.ClipboardEvent({
      files: fileList,
      getData(type) { return type === "text/html" ? '<p>text<img src="blob:clipboard/image"></p>' : ""; },
    });
    const handled = plugin.props.handlePaste(view, event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { handled, uploadCalls, doc: view.state.doc };
  }

  try {
    const defaultBehavior = await tryPaste(false);
    assert.equal(defaultBehavior.handled, false);
    assert.equal(defaultBehavior.uploadCalls, 0);

    assert.equal(communityEnableHtmlFileUploader, true);
    const appBehavior = await tryPaste(communityEnableHtmlFileUploader);
    assert.equal(appBehavior.handled, true);
    assert.equal(appBehavior.uploadCalls, 1);
    assert.equal(appBehavior.doc.textContent, "text");
    let insertedSource = "";
    appBehavior.doc.descendants((node) => {
      if (node.type === schema.nodes.image) insertedSource = node.attrs.src;
    });
    assert.equal(insertedSource, "community-upload://test-token");
  } finally {
    if (previousClipboardEvent === undefined) delete globalThis.ClipboardEvent;
    else globalThis.ClipboardEvent = previousClipboardEvent;
    if (previousDragEvent === undefined) delete globalThis.DragEvent;
    else globalThis.DragEvent = previousDragEvent;
  }
});
