use std::{collections::BTreeMap, io};

use serde_json::{Value, json};

use super::*;

const SOURCE: &[u8] = include_bytes!("../buildings.glb");
const SECTIONS: [&str; 5] = ["nodes", "meshes", "materials", "accessors", "bufferViews"];

struct Glb<'a> {
    document: Value,
    binary: &'a [u8],
}

impl<'a> Glb<'a> {
    fn parse(bytes: &'a [u8]) -> io::Result<Self> {
        if bytes.get(..4) != Some(b"glTF") || word(bytes, 4)? != 2 || word(bytes, 8)? != bytes.len()
        {
            return Err(invalid());
        }
        let json_end = 20 + word(bytes, 12)?;
        if bytes.get(16..20) != Some(b"JSON")
            || bytes.get(json_end + 4..json_end + 8) != Some(b"BIN\0")
        {
            return Err(invalid());
        }
        let binary_start = json_end + 8;
        let binary_end = binary_start + word(bytes, json_end)?;
        Ok(Self {
            document: serde_json::from_slice(bytes.get(20..json_end).ok_or_else(invalid)?)?,
            binary: bytes.get(binary_start..binary_end).ok_or_else(invalid)?,
        })
    }
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "Invalid bundled model data.")
}

fn word(bytes: &[u8], at: usize) -> io::Result<usize> {
    let bytes: [u8; 4] = bytes
        .get(at..at + 4)
        .ok_or_else(invalid)?
        .try_into()
        .map_err(|_| invalid())?;
    Ok(u32::from_le_bytes(bytes) as usize)
}

struct SceneExport<'a> {
    source: &'a Glb<'a>,
    indices: BTreeMap<(&'static str, usize), usize>,
    document: Value,
    binary: Vec<u8>,
}

impl SceneExport<'_> {
    fn remap(&mut self, section: &'static str, reference: &mut Value) -> io::Result<()> {
        let original = reference.as_u64().ok_or_else(invalid)? as usize;
        if let Some(&index) = self.indices.get(&(section, original)) {
            *reference = json!(index);
            return Ok(());
        }
        let mut item = self.source.document[section]
            .get(original)
            .ok_or_else(invalid)?
            .clone();
        let list = self.document[section].as_array_mut().ok_or_else(invalid)?;
        let index = list.len();
        list.push(Value::Null);
        self.indices.insert((section, original), index);
        match section {
            "nodes" => {
                if let Some(mesh) = item.get_mut("mesh") {
                    self.remap("meshes", mesh)?;
                }
                if let Some(children) = item.get_mut("children") {
                    self.remap_all("nodes", children)?;
                }
            }
            "meshes" => {
                for primitive in item["primitives"].as_array_mut().ok_or_else(invalid)? {
                    if let Some(material) = primitive.get_mut("material") {
                        self.remap("materials", material)?;
                    }
                    if let Some(indices) = primitive.get_mut("indices") {
                        self.remap("accessors", indices)?;
                    }
                    for accessor in primitive["attributes"]
                        .as_object_mut()
                        .ok_or_else(invalid)?
                        .values_mut()
                    {
                        self.remap("accessors", accessor)?;
                    }
                }
            }
            "accessors" => self.remap("bufferViews", &mut item["bufferView"])?,
            "bufferViews" => {
                let offset = item["byteOffset"].as_u64().unwrap_or_default() as usize;
                let length = item["byteLength"].as_u64().ok_or_else(invalid)? as usize;
                let end = offset.checked_add(length).ok_or_else(invalid)?;
                let data = self.source.binary.get(offset..end).ok_or_else(invalid)?;
                self.binary.resize(self.binary.len().next_multiple_of(4), 0);
                item["byteOffset"] = json!(self.binary.len());
                self.binary.extend_from_slice(data);
            }
            "materials" => {}
            _ => return Err(invalid()),
        }
        self.document[section][index] = item;
        *reference = json!(index);
        Ok(())
    }

    fn remap_all(&mut self, section: &'static str, items: &mut Value) -> io::Result<()> {
        if let Some(items) = items.as_array_mut() {
            for item in items {
                self.remap(section, item)?;
            }
        }
        Ok(())
    }

    fn encode(mut self, scene: Value) -> io::Result<Vec<u8>> {
        self.document["scenes"] = json!([scene]);
        self.document["buffers"] = json!([{ "byteLength": self.binary.len() }]);
        if let Some(document) = self.document.as_object_mut() {
            document.retain(|_, value| !value.as_array().is_some_and(Vec::is_empty));
        }
        let mut manifest = serde_json::to_vec(&self.document)?;
        manifest.resize(manifest.len().next_multiple_of(4), b' ');
        self.binary.resize(self.binary.len().next_multiple_of(4), 0);
        let size = 28 + manifest.len() + self.binary.len();
        let mut bytes = Vec::with_capacity(size);
        bytes.extend(b"glTF");
        for number in [2, size as u32, manifest.len() as u32] {
            bytes.extend(number.to_le_bytes());
        }
        bytes.extend(b"JSON");
        bytes.extend(manifest);
        bytes.extend((self.binary.len() as u32).to_le_bytes());
        bytes.extend(b"BIN\0");
        bytes.extend(self.binary);
        Ok(bytes)
    }
}

fn standalone_scene(source: &Glb, model: usize) -> io::Result<Vec<u8>> {
    let mut scene = source.document["scenes"]
        .get(model)
        .ok_or_else(invalid)?
        .clone();
    let mut document = json!({ "asset": source.document["asset"], "scene": 0 });
    for name in SECTIONS {
        document[name] = json!([]);
    }
    let mut export = SceneExport {
        source,
        indices: BTreeMap::new(),
        document,
        binary: Vec::new(),
    };
    export.remap_all("nodes", &mut scene["nodes"])?;
    export.encode(scene)
}

pub(super) fn export_selected(
    input: InspectionInput,
    catalog: Res<WorkshopCatalog>,
    mut workshop: ResMut<Workshop>,
    pending: Query<(), With<Screenshot>>,
    sprite_capture: Option<Res<sprites::SpriteCapture>>,
) {
    if !(input.keys.just_pressed(KeyCode::F8) || input.clicked(InspectionAction::Source))
        || workshop.together
        || workshop.search.is_some()
        || !pending.is_empty()
        || sprite_capture.is_some()
    {
        return;
    }
    let id = &workshop.assets[workshop.selected];
    let result = (|| -> io::Result<_> {
        let model = catalog.0[id].model;
        let source = Glb::parse(SOURCE)?;
        let bytes = standalone_scene(&source, model)?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(io::Error::other)?;
        let directory =
            crate::save::location(crate::setup::Mode::Story)?.with_file_name("workshop");
        let path = directory.join(format!("{id}-model-{}.glb", stamp.as_nanos()));
        crate::save::atomic_write(&path, &bytes, SOURCE.len() as u64)?;
        Ok(path)
    })();
    workshop.export_notice = match result {
        Ok(path) => format!("Saved 3D source · {}", path.display()),
        Err(error) => format!("Could not export 3D source · {error}"),
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_workshop_asset_has_a_valid_standalone_scene() {
        let source = Glb::parse(SOURCE).unwrap();
        let catalog = WorkshopCatalog::default();
        for (asset, model) in &catalog.0 {
            let bytes = standalone_scene(&source, model.model)
                .unwrap_or_else(|error| panic!("{asset}: {error}"));
            let exported = Glb::parse(&bytes).unwrap();
            assert_eq!(
                exported.document["scenes"].as_array().unwrap().len(),
                1,
                "{asset}"
            );
            assert!(!exported.binary.is_empty(), "{asset}");
        }
    }

    #[test]
    fn exports_only_the_selected_scene_and_preserves_its_geometry_buffers() {
        let source = Glb::parse(SOURCE).unwrap();
        let model = Catalog::default().projects["shed"].model;
        let bytes = standalone_scene(&source, model).unwrap();
        let exported = Glb::parse(&bytes).unwrap();
        assert_eq!(exported.document["scenes"].as_array().unwrap().len(), 1);
        assert_eq!(exported.document["scenes"][0]["name"], "shed");
        assert!(
            exported.document["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|node| node["name"] == "functional-roof")
        );
        let first = &exported.document["bufferViews"][0];
        let length = first["byteLength"].as_u64().unwrap() as usize;
        let original_index = source.document["scenes"][model]["nodes"][0]
            .as_u64()
            .unwrap() as usize;
        let root = &source.document["nodes"][original_index];
        let first_child = root["children"][0].as_u64().unwrap() as usize;
        let mesh = source.document["nodes"][first_child]["mesh"]
            .as_u64()
            .unwrap() as usize;
        let primitive = &source.document["meshes"][mesh]["primitives"][0];
        let attribute = primitive["attributes"]
            .as_object()
            .unwrap()
            .values()
            .next()
            .unwrap()
            .as_u64()
            .unwrap() as usize;
        let original_index = primitive
            .get("indices")
            .and_then(Value::as_u64)
            .map_or(attribute, |id| id as usize);
        let view = source.document["accessors"][original_index]["bufferView"]
            .as_u64()
            .unwrap() as usize;
        let offset = source.document["bufferViews"][view]["byteOffset"]
            .as_u64()
            .unwrap_or_default() as usize;
        assert_eq!(
            exported.binary[..length],
            source.binary[offset..offset + length]
        );
        assert!(bytes.len() < SOURCE.len() / 3);
    }
}
