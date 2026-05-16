import { backendApi } from '../../shared/api/backendApi';

export type ProductUnit = 'kg' | 'g' | 'piece';
export type ProductStatus = 'active' | 'inactive' | 'archived';

export type Product = {
  id: string;
  defaultPluCode: string;
  name: string;
  shortName: string;
  description: string | null;
  imageUrl: string | null;
  imageFileAssetId: string | null;
  barcode: string | null;
  sku: string | null;
  unit: ProductUnit;
  status: ProductStatus;
  unavailableForNewActivePlacements: boolean;
  activePlacementCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FileAsset = {
  id: string;
  originalFileName: string;
  storedFilename: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  createdAt: string;
};

export type ProductWarning = {
  code: string;
  message: string;
  activePlacementCount?: number;
};

export type ProductFormValues = {
  defaultPluCode: string;
  name: string;
  shortName: string;
  description?: string;
  imageUrl?: string;
  imageFileAssetId?: string;
  barcode?: string;
  sku?: string;
  unit: ProductUnit;
  status: ProductStatus;
};

type ListProductsQuery = {
  search?: string;
  status?: ProductStatus | 'all';
  take?: number;
  skip?: number;
};

type WriteProductRequest = ProductFormValues & {
  csrfToken: string;
  csrfHeaderName: string;
};

type UpdateProductRequest = ProductFormValues & {
  productId: string;
  csrfToken: string;
  csrfHeaderName: string;
};

type UploadProductImageRequest = {
  file: File;
  csrfToken: string;
  csrfHeaderName: string;
};

export const productsApi = backendApi.injectEndpoints({
  endpoints: (builder) => ({
    listProducts: builder.query<{ products: Product[]; total: number; take: number; skip: number }, ListProductsQuery | void>({
      query: (params) => ({
        url: '/products',
        params: {
          ...(params?.search ? { search: params.search } : {}),
          ...(params?.status && params.status !== 'all' ? { status: params.status } : {}),
          ...(params?.take ? { take: String(params.take) } : {}),
          ...(params?.skip ? { skip: String(params.skip) } : {}),
        },
      }),
      providesTags: (result) => [
        { type: 'Products', id: 'LIST' },
        ...(result?.products.map((product) => ({ type: 'Products' as const, id: product.id })) ?? []),
      ],
    }),
    getProduct: builder.query<{ product: Product }, string>({
      query: (productId) => `/products/${productId}`,
      providesTags: (_result, _error, productId) => [{ type: 'Products', id: productId }],
    }),
    createProduct: builder.mutation<{ product: Product }, WriteProductRequest>({
      query: ({ csrfToken, csrfHeaderName, ...body }) => ({
        url: '/products',
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body,
      }),
      invalidatesTags: [{ type: 'Products', id: 'LIST' }],
    }),
    updateProduct: builder.mutation<{ product: Product; warning: ProductWarning | null }, UpdateProductRequest>({
      query: ({ productId, csrfToken, csrfHeaderName, ...body }) => ({
        url: `/products/${productId}`,
        method: 'PATCH',
        headers: { [csrfHeaderName]: csrfToken },
        body,
      }),
      invalidatesTags: (_result, _error, { productId }) => [
        { type: 'Products', id: productId },
        { type: 'Products', id: 'LIST' },
        { type: 'CatalogPlacements' },
        { type: 'Prices' },
        { type: 'Publishing' },
      ],
    }),
    uploadProductImage: builder.mutation<{ fileAsset: FileAsset }, UploadProductImageRequest>({
      query: ({ file, csrfToken, csrfHeaderName }) => {
        const body = new FormData();
        body.append('file', file);

        return {
          url: '/files/images',
          method: 'POST',
          headers: { [csrfHeaderName]: csrfToken },
          body,
        };
      },
    }),
  }),
});

export const {
  useListProductsQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useUploadProductImageMutation,
} = productsApi;
