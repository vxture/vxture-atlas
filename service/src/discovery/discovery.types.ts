/** product_210 §4.1 tool descriptor shape. */
export interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  version: string;
  deprecated: boolean;
  metering?: { metric: string; mode: "per_call" | "per_unit" };
  authz?: { asset_types: string[] };
}

export interface VxtureToolsResponse {
  protocol_version: string;
  tools: ToolDescriptor[];
}
