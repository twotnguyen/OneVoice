export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          slug: string | null
          source_category_id: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          slug?: string | null
          source_category_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          slug?: string | null
          source_category_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          assignment_method: string | null
          category_id: string
          created_at: string
          is_primary: boolean
          metadata: Json | null
          product_id: string
        }
        Insert: {
          assignment_method?: string | null
          category_id: string
          created_at?: string
          is_primary?: boolean
          metadata?: Json | null
          product_id: string
        }
        Update: {
          assignment_method?: string | null
          category_id?: string
          created_at?: string
          is_primary?: boolean
          metadata?: Json | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          position: number
          product_id: string
          source_url: string
          storage_path: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          product_id: string
          source_url: string
          storage_path?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          product_id?: string
          source_url?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_runs: {
        Row: {
          completed_at: string | null
          error_summary: Json | null
          failed_rows: number
          id: string
          inserted_rows: number
          organization_id: string | null
          source_file: string | null
          source_sha256: string | null
          started_at: string
          status: string
          total_rows: number
          updated_rows: number
        }
        Insert: {
          completed_at?: string | null
          error_summary?: Json | null
          failed_rows?: number
          id?: string
          inserted_rows?: number
          organization_id?: string | null
          source_file?: string | null
          source_sha256?: string | null
          started_at?: string
          status?: string
          total_rows?: number
          updated_rows?: number
        }
        Update: {
          completed_at?: string | null
          error_summary?: Json | null
          failed_rows?: number
          id?: string
          inserted_rows?: number
          organization_id?: string | null
          source_file?: string | null
          source_sha256?: string | null
          started_at?: string
          status?: string
          total_rows?: number
          updated_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_import_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_promotions: {
        Row: {
          created_at: string
          product_id: string
          promotion_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          promotion_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_promotions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "active_product_promotions"
            referencedColumns: ["promotion_id"]
          },
          {
            foreignKeyName: "product_promotions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          compare_at_price_vnd: number | null
          created_at: string
          id: string
          image_url: string | null
          in_stock: boolean | null
          name: string | null
          options: Json | null
          price_vnd: number | null
          product_id: string
          sku: string | null
          source_variant_id: string | null
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          compare_at_price_vnd?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name?: string | null
          options?: Json | null
          price_vnd?: number | null
          product_id: string
          sku?: string | null
          source_variant_id?: string | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          compare_at_price_vnd?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name?: string | null
          options?: Json | null
          price_vnd?: number | null
          product_id?: string
          sku?: string | null
          source_variant_id?: string | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          availability: string | null
          brand: string | null
          breadcrumbs: Json | null
          canonical_url: string
          category_name: string | null
          collected_at: string | null
          compare_at_price_vnd: number | null
          completeness_score: number | null
          created_at: string
          currency: string
          description: string | null
          description_text: string | null
          extractor_version: string | null
          id: string
          in_stock: boolean
          name: string
          normalized_attributes: Json | null
          organization_id: string
          price_vnd: number | null
          product_type: string | null
          quality: string
          sku: string | null
          slug: string | null
          source_http_status: number | null
          source_name: string | null
          source_payload: Json | null
          source_product_id: string | null
          source_url: string
          specification_count: number
          specifications: Json | null
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          brand?: string | null
          breadcrumbs?: Json | null
          canonical_url: string
          category_name?: string | null
          collected_at?: string | null
          compare_at_price_vnd?: number | null
          completeness_score?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          description_text?: string | null
          extractor_version?: string | null
          id?: string
          in_stock: boolean
          name: string
          normalized_attributes?: Json | null
          organization_id: string
          price_vnd?: number | null
          product_type?: string | null
          quality: string
          sku?: string | null
          slug?: string | null
          source_http_status?: number | null
          source_name?: string | null
          source_payload?: Json | null
          source_product_id?: string | null
          source_url: string
          specification_count?: number
          specifications?: Json | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          brand?: string | null
          breadcrumbs?: Json | null
          canonical_url?: string
          category_name?: string | null
          collected_at?: string | null
          compare_at_price_vnd?: number | null
          completeness_score?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          description_text?: string | null
          extractor_version?: string | null
          id?: string
          in_stock?: boolean
          name?: string
          normalized_attributes?: Json | null
          organization_id?: string
          price_vnd?: number | null
          product_type?: string | null
          quality?: string
          sku?: string | null
          slug?: string | null
          source_http_status?: number | null
          source_name?: string | null
          source_payload?: Json | null
          source_product_id?: string | null
          source_url?: string
          specification_count?: number
          specifications?: Json | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          created_at: string
          discount_type: string | null
          discount_value: number | null
          expires_at: string | null
          id: string
          is_flash_sale: boolean
          label: string
          organization_id: string
          promotion_type: string | null
          source_code: string | null
          source_payload: Json | null
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          is_flash_sale?: boolean
          label: string
          organization_id: string
          promotion_type?: string | null
          source_code?: string | null
          source_payload?: Json | null
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          is_flash_sale?: boolean
          label?: string
          organization_id?: string
          promotion_type?: string | null
          source_code?: string | null
          source_payload?: Json | null
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      render_events: {
        Row: {
          created_at: string
          error_code: string | null
          error_stage: string | null
          id: string
          model: string | null
          organization_id: string
          product_id: string | null
          render_id: string
          stage_timings: Json | null
          status: string
          tokens_input: number | null
          tokens_output: number | null
          tokens_total: number | null
          total_duration_ms: number | null
          video_bytes: number | null
          video_duration_ms: number | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_stage?: string | null
          id?: string
          model?: string | null
          organization_id: string
          product_id?: string | null
          render_id: string
          stage_timings?: Json | null
          status: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          total_duration_ms?: number | null
          video_bytes?: number | null
          video_duration_ms?: number | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_stage?: string | null
          id?: string
          model?: string | null
          organization_id?: string
          product_id?: string | null
          render_id?: string
          stage_timings?: Json | null
          status?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          total_duration_ms?: number | null
          video_bytes?: number | null
          video_duration_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "render_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_product_promotions: {
        Row: {
          discount_type: string | null
          discount_value: number | null
          expires_at: string | null
          is_flash_sale: boolean | null
          label: string | null
          organization_id: string | null
          product_id: string | null
          promotion_id: string | null
          promotion_type: string | null
          source_code: string | null
          starts_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "content_ready_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_content_context"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ready_products: {
        Row: {
          availability: string | null
          brand: string | null
          breadcrumbs: Json | null
          canonical_url: string | null
          category_name: string | null
          collected_at: string | null
          compare_at_price_vnd: number | null
          completeness_score: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          description_text: string | null
          extractor_version: string | null
          id: string | null
          in_stock: boolean | null
          name: string | null
          normalized_attributes: Json | null
          organization_id: string | null
          price_vnd: number | null
          product_type: string | null
          quality: string | null
          sku: string | null
          slug: string | null
          source_http_status: number | null
          source_name: string | null
          source_product_id: string | null
          source_url: string | null
          specification_count: number | null
          specifications: Json | null
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          availability?: string | null
          brand?: string | null
          breadcrumbs?: Json | null
          canonical_url?: string | null
          category_name?: string | null
          collected_at?: string | null
          compare_at_price_vnd?: number | null
          completeness_score?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          description_text?: string | null
          extractor_version?: string | null
          id?: string | null
          in_stock?: boolean | null
          name?: string | null
          normalized_attributes?: Json | null
          organization_id?: string | null
          price_vnd?: number | null
          product_type?: string | null
          quality?: string | null
          sku?: string | null
          slug?: string | null
          source_http_status?: number | null
          source_name?: string | null
          source_product_id?: string | null
          source_url?: string | null
          specification_count?: number | null
          specifications?: Json | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          availability?: string | null
          brand?: string | null
          breadcrumbs?: Json | null
          canonical_url?: string | null
          category_name?: string | null
          collected_at?: string | null
          compare_at_price_vnd?: number | null
          completeness_score?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          description_text?: string | null
          extractor_version?: string | null
          id?: string | null
          in_stock?: boolean | null
          name?: string | null
          normalized_attributes?: Json | null
          organization_id?: string | null
          price_vnd?: number | null
          product_type?: string | null
          quality?: string | null
          sku?: string | null
          slug?: string | null
          source_http_status?: number | null
          source_name?: string | null
          source_product_id?: string | null
          source_url?: string | null
          specification_count?: number | null
          specifications?: Json | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_content_context: {
        Row: {
          active_promotions: Json | null
          brand: string | null
          collected_at: string | null
          compare_at_price: number | null
          completeness_score: number | null
          current_price: number | null
          in_stock: boolean | null
          is_data_stale: boolean | null
          name: string | null
          normalized_attributes: Json | null
          organization_id: string | null
          primary_image_url: string | null
          product_id: string | null
          product_type: string | null
          quality: string | null
          sku: string | null
          specifications: Json | null
          stock_quantity: number | null
        }
        Insert: {
          active_promotions?: never
          brand?: string | null
          collected_at?: string | null
          compare_at_price?: number | null
          completeness_score?: number | null
          current_price?: number | null
          in_stock?: boolean | null
          is_data_stale?: never
          name?: string | null
          normalized_attributes?: Json | null
          organization_id?: string | null
          primary_image_url?: never
          product_id?: string | null
          product_type?: string | null
          quality?: string | null
          sku?: string | null
          specifications?: Json | null
          stock_quantity?: number | null
        }
        Update: {
          active_promotions?: never
          brand?: string | null
          collected_at?: string | null
          compare_at_price?: number | null
          completeness_score?: number | null
          current_price?: number | null
          in_stock?: boolean | null
          is_data_stale?: never
          name?: string | null
          normalized_attributes?: Json | null
          organization_id?: string | null
          primary_image_url?: never
          product_id?: string | null
          product_type?: string | null
          quality?: string | null
          sku?: string | null
          specifications?: Json | null
          stock_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      onevoice_healthcheck: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

