import { backendApi } from '../../shared/api/backendApi';
import type { PaginationMeta } from '../../shared/pagination/Pagination';
import type { FileAsset } from '../products/productsApi';

export type BannerStatus = 'active' | 'inactive' | 'archived';

export type AdvertisingBanner = {
  id: string;
  storeId: string;
  imageUrl: string;
  imageFileAssetId: string | null;
  status: BannerStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type CsrfRequest = {
  csrfToken: string;
  csrfHeaderName: string;
};

type CreateBannerRequest = CsrfRequest & {
  storeId: string;
  imageUrl: string;
  imageFileAssetId?: string | null;
  status?: BannerStatus;
  sortOrder?: number;
};

type UpdateBannerStatusRequest = CsrfRequest & {
  storeId: string;
  bannerId: string;
  status: BannerStatus;
};

type ReorderBannersRequest = CsrfRequest & {
  storeId: string;
  bannerIds: string[];
};

type UploadBannerImageRequest = CsrfRequest & {
  file: File;
};

export type ListBannersQuery = {
  storeId: string;
  limit?: number;
  offset?: number;
};

export type AdvertisingBannersResponse = {
  data: AdvertisingBanner[];
  meta: PaginationMeta;
};

function buildBannersQuery({ limit, offset }: ListBannersQuery) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const advertisingApi = backendApi.injectEndpoints({
  endpoints: (builder) => ({
    listAdvertisingBanners: builder.query<AdvertisingBannersResponse, ListBannersQuery>({
      query: (params) => `/stores/${params.storeId}/advertising/banners${buildBannersQuery(params)}`,
      providesTags: (result, _error, { storeId }) => [
        { type: 'AdvertisingBanners', id: `STORE-${storeId}` },
        ...(result?.data.map((banner) => ({ type: 'AdvertisingBanners' as const, id: banner.id })) ?? []),
      ],
    }),
    uploadBannerImage: builder.mutation<{ fileAsset: FileAsset }, UploadBannerImageRequest>({
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
    createAdvertisingBanner: builder.mutation<{ banner: AdvertisingBanner }, CreateBannerRequest>({
      query: ({ storeId, csrfToken, csrfHeaderName, ...body }) => ({
        url: `/stores/${storeId}/advertising/banners`,
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: 'AdvertisingBanners', id: `STORE-${storeId}` }],
    }),
    updateAdvertisingBannerStatus: builder.mutation<{ banner: AdvertisingBanner }, UpdateBannerStatusRequest>({
      query: ({ storeId, bannerId, status, csrfToken, csrfHeaderName }) => ({
        url: `/stores/${storeId}/advertising/banners/${bannerId}/status`,
        method: 'PATCH',
        headers: { [csrfHeaderName]: csrfToken },
        body: { status },
      }),
      invalidatesTags: (_result, _error, { storeId, bannerId }) => [
        { type: 'AdvertisingBanners', id: bannerId },
        { type: 'AdvertisingBanners', id: `STORE-${storeId}` },
      ],
    }),
    reorderAdvertisingBanners: builder.mutation<{ banners: AdvertisingBanner[] }, ReorderBannersRequest>({
      query: ({ storeId, bannerIds, csrfToken, csrfHeaderName }) => ({
        url: `/stores/${storeId}/advertising/banners/reorder`,
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body: { bannerIds },
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: 'AdvertisingBanners', id: `STORE-${storeId}` }],
    }),
  }),
});

export const {
  useListAdvertisingBannersQuery,
  useUploadBannerImageMutation,
  useCreateAdvertisingBannerMutation,
  useUpdateAdvertisingBannerStatusMutation,
  useReorderAdvertisingBannersMutation,
} = advertisingApi;
