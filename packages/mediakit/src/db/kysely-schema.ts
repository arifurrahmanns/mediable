export interface MediaTableRow {
  id: string
  uuid: string
  model_type: string
  model_id: string
  collection_name: string
  name: string
  file_name: string
  mime_type: string
  disk: string
  conversions_disk: string
  size: number
  manipulations: string
  custom_properties: string
  generated_conversions: string
  responsive_images: string
  order_column: number
  status: 'pending' | 'ready' | 'failed'
  optimized_at: string | null
  created_at: string
  updated_at: string
}

export interface KyselyDatabaseSchema {
  media: MediaTableRow
}
