// / <reference path="../node_modules/litegraph.js/src/litegraph.d.ts" />
// @ts-ignore
import { app } from "../../scripts/app.js";
import type {Vector2, LLink, LGraphCanvas as TLGraphCanvas, LGraph, SerializedLGraphNode, INodeInputSlot, INodeOutputSlot, LGraphNode as TLGraphNode, LiteGraph as TLiteGraph} from './typings/litegraph.js';
import { addConnectionLayoutSupport, addMenuSubMenu } from "./utils.js";

declare const LiteGraph: typeof TLiteGraph;
declare const LGraphNode: typeof TLGraphNode;
declare const LGraphCanvas: typeof TLGraphCanvas;


app.registerExtension({
	name: "rgthree.Reroute",
	registerCustomNodes() {
		class RerouteNode extends LGraphNode {

			static override title = "Reroute (rgthree)";
       // `category` seems to get reset at register, so we'll
       // re-reset it after the register call. ¯\_(ツ)_/¯
      static category = 'rgthree';
      static _category = 'rgthree';
			static readonly title_mode = LiteGraph.NO_TITLE;
			static collapsable = false;
      static layout_slot_offset = 5;
      static size: Vector2 = [40, 30];  // Starting size, read from within litegraph.core

      readonly isVirtualNode?: boolean;

			constructor(title = RerouteNode.title) {
        super(title);
				this.isVirtualNode = true;
        this.resizable = false;
        this.size = RerouteNode.size; // Starting size.
				this.addInput("", "*");
				this.addOutput("", "*");
        setTimeout(() => this.applyNodeSize(), 20);
      }

      override configure(info: SerializedLGraphNode) {
        super.configure(info);
        this.applyNodeSize();
      }

      override clone() {
        const cloned = super.clone();
        cloned.inputs[0]!.type = '*';
        cloned.outputs[0]!.type = '*';
        return cloned;
      }

      /**
       * Copied a good bunch of this from the original reroute included with comfy.
       */
      override onConnectionsChange(type: number, _slotIndex: number, connected: boolean, _link_info: LLink, _ioSlot: (INodeOutputSlot | INodeInputSlot)) {
        // Prevent multiple connections to different types when we have no input
        if (connected && type === LiteGraph.OUTPUT) {
          // Ignore wildcard nodes as these will be updated to real types
          const types = new Set(this.outputs[0]!.links!.map((l) => app.graph.links[l].type).filter((t) => t !== "*"));
          if (types.size > 1) {
            const linksToDisconnect = [];
            for (let i = 0; i < this.outputs[0]!.links!.length - 1; i++) {
              const linkId = this.outputs[0]!.links![i];
              const link = app.graph.links[linkId];
              linksToDisconnect.push(link);
            }
            for (const link of linksToDisconnect) {
              const node = app.graph.getNodeById(link.target_id);
              node.disconnectInput(link.target_slot);
            }
          }
        }

        // Find root input
        let currentNode: TLGraphNode|null = this;
        let updateNodes = [];
        let inputType = null;
        let inputNode = null;
        while (currentNode) {
          updateNodes.unshift(currentNode);
          const linkId: number | null = currentNode.inputs[0]!.link;
          if (linkId !== null) {
            const link: LLink = (app.graph as LGraph).links[linkId]!;
            const node: TLGraphNode = (app.graph as LGraph).getNodeById(link.origin_id)!;
            const type = (node.constructor as typeof TLGraphNode).type;
            if (type?.includes("Reroute")) {
              if (node === this) {
                // We've found a circle
                currentNode.disconnectInput(link.target_slot);
                currentNode = null;
              }
              else {
                // Move the previous node
                currentNode = node;
              }
            } else {
              // We've found the end
              inputNode = currentNode;
              inputType = node.outputs[link.origin_slot]?.type ?? null;
              break;
            }
          } else {
            // This path has no input node
            currentNode = null;
            break;
          }
        }

        // Find all outputs
        const nodes: TLGraphNode[] = [this];
        let outputType = null;
        while (nodes.length) {
          currentNode = nodes.pop()!;
          const outputs = (currentNode.outputs ? currentNode.outputs[0]!.links : []) || [];
          if (outputs.length) {
            for (const linkId of outputs) {
              const link = app.graph.links[linkId];

              // When disconnecting sometimes the link is still registered
              if (!link) continue;

              const node = app.graph.getNodeById(link.target_id);
              // Don't know why this ever happens.. but it did around the repeater..
              if (!node) continue;
              const type = node.constructor.type;
              if (type?.includes("Reroute")) {
                // Follow reroute nodes
                nodes.push(node);
                updateNodes.push(node);
              } else {
                // We've found an output
                const nodeOutType = node.inputs && node.inputs[link?.target_slot] && node.inputs[link.target_slot].type ? node.inputs[link.target_slot].type : null;
                if (inputType && nodeOutType !== inputType && nodeOutType !== '*') {
                  // The output doesnt match our input so disconnect it
                  node.disconnectInput(link.target_slot);
                } else {
                  outputType = nodeOutType;
                }
              }
            }
          } else {
            // No more outputs for this path
          }
        }

        const displayType = inputType || outputType || "*";
        const color = LGraphCanvas.link_type_colors[displayType];

        // Update the types of each node
        for (const node of updateNodes) {
          // If we dont have an input type we are always wildcard but we'll show the output type
          // This lets you change the output link to a different type and all nodes will update
          node.outputs[0].type = inputType || "*";
          node.__outputType = displayType;
          node.outputs[0].name = node.properties.showOutputText ? displayType : "";
          node.size = node.computeSize();
          node.applyNodeSize?.();

          for (const l of node.outputs[0].links || []) {
            const link = app.graph.links[l];
            if (link) {
              link.color = color;
            }
          }
        }

        if (inputNode) {
          const link = app.graph.links[inputNode.inputs[0]!.link];
          if (link) {
            link.color = color;
          }
        }
        app.graph.setDirtyCanvas(true, true);
      }

			applyNodeSize() {
        this.properties['size'] = this.properties['size'] || RerouteNode.size;
        this.properties['size'] = [Number(this.properties['size'][0]), Number(this.properties['size'][1])];
        this.size = this.properties['size'];
        app.graph.setDirtyCanvas(true, true);
      }
		}

    // @ts-ignore: Fix incorrect litegraph typings.
    addConnectionLayoutSupport(RerouteNode, app, [
      ["Left","Right"],
      ["Left","Top"],
      ["Left","Bottom"],
      ["Right","Left"],
      ["Right","Top"],
      ["Right","Bottom"],
      ["Top","Left"],
      ["Top","Right"],
      ["Top","Bottom"],
      ["Bottom","Left"],
      ["Bottom","Right"],
      ["Bottom","Top"],
    ], (node) => {(node as RerouteNode).applyNodeSize();});


    // @ts-ignore: Fix incorrect litegraph typings.
    addMenuSubMenu(RerouteNode, app, {
      name: 'Height',
      property: 'size',
      options: (() => {
        const options = [];
        for (let w = 8; w > 0; w--) {
          options.push(`${w * 10}`);
        }
        return options;
      })(),
      prepareValue: (value, node) => [node.size[0], Number(value)],
      callback: (node) => (node as RerouteNode).applyNodeSize()
    });

    // @ts-ignore: Fix incorrect litegraph typings.
    addMenuSubMenu(RerouteNode, app, {
      name: 'Width',
      property: 'size',
      options: (() => {
        const options = [];
        for (let w = 8; w > 0; w--) {
          options.push(`${w * 10}`);
        }
        return options;
      })(),
      prepareValue: (value, node) => [Number(value), node.size[1]],
      callback: (node) => (node as RerouteNode).applyNodeSize()
    });


		LiteGraph.registerNodeType(RerouteNode.title, RerouteNode);
    RerouteNode.category = RerouteNode._category;
	},
});
