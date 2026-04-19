-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uuid" TEXT NOT NULL,
    "model_type" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "collection_name" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "disk" TEXT NOT NULL,
    "conversions_disk" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "manipulations" TEXT NOT NULL DEFAULT '{}',
    "custom_properties" TEXT NOT NULL DEFAULT '{}',
    "generated_conversions" TEXT NOT NULL DEFAULT '{}',
    "responsive_images" TEXT NOT NULL DEFAULT '{}',
    "order_column" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "optimized_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "media_uuid_key" ON "media"("uuid");

-- CreateIndex
CREATE INDEX "media_model_type_model_id_idx" ON "media"("model_type", "model_id");

-- CreateIndex
CREATE INDEX "media_model_type_model_id_collection_name_idx" ON "media"("model_type", "model_id", "collection_name");

-- CreateIndex
CREATE INDEX "media_status_created_at_idx" ON "media"("status", "created_at");
