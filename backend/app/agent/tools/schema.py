from typing import Any


def pydantic_to_gemini_schema(model: type) -> dict[str, Any]:
    schema = model.model_json_schema(ref_template="#/$defs/{model}")
    definitions = schema.get("$defs", {})

    def convert(value: dict) -> dict:
        if "$ref" in value:
            key = value["$ref"].rsplit("/", 1)[-1]
            return convert(definitions[key]) if key in definitions else {"type": "OBJECT"}
        result = {}
        description = value.get("description")
        if description:
            result["description"] = description
        enum = value.get("enum")
        if enum:
            result["enum"] = enum
        alternatives = value.get("anyOf") or value.get("oneOf") or []
        non_null = [item for item in alternatives if item.get("type") != "null"]
        if non_null:
            chosen = next((item for item in non_null if item.get("type") == "object"), non_null[0])
            result.update(convert(chosen))
            if description:
                result["description"] = description
            return result
        kind = value.get("type")
        type_map = {"string": "STRING", "integer": "INTEGER", "number": "NUMBER", "boolean": "BOOLEAN", "object": "OBJECT", "array": "ARRAY"}
        if kind in type_map:
            result["type"] = type_map[kind]
        if kind == "object" or "properties" in value:
            result["type"] = "OBJECT"
            result["properties"] = {key: convert(item) for key, item in value.get("properties", {}).items()}
            if value.get("required"):
                result["required"] = value["required"]
        if kind == "array" and isinstance(value.get("items"), dict):
            result["items"] = convert(value["items"])
        for key in ("minimum", "maximum", "minLength", "maxLength", "format"):
            if key in value:
                result[key] = value[key]
        return result

    return convert(schema)
