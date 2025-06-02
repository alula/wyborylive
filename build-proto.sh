# Create an output directory for generated files if it doesn't exist
mkdir -p src/generated

# Run protoc with the ts-proto plugin
protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./src/generated \
  --ts_proto_opt=esModuleInterop=true \
  --ts_proto_opt=forceLong=string \
  src/pkw.proto