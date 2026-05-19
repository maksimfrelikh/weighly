#!/usr/bin/env bash
curl -X POST http://localhost:3000/api/scales/check-update \
  -H "x-scale-api-token: xKtJ93t9AU14U4mkNtzxAxTaycHBz5BU6KAGPBBovxc" \
  -H "content-type: application/json" \
  -d '{}'
