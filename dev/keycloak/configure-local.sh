#!/bin/sh
set -eu

KCADM=/opt/keycloak/bin/kcadm.sh
SERVER=http://keycloak:8080
REALM=holedo-local
ROLE=holedo-platform-admin

attempt=0
until "$KCADM" config credentials \
  --server "$SERVER" \
  --realm master \
  --user "$KEYCLOAK_ADMIN_USERNAME" \
  --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Keycloak did not become ready in time" >&2
    exit 1
  fi
  sleep 2
done

if ! "$KCADM" get "roles/$ROLE" -r "$REALM" >/dev/null 2>&1; then
  "$KCADM" create roles -r "$REALM" \
    -s "name=$ROLE" \
    -s "description=Holedo platform administrator"
fi

"$KCADM" set-password -r "$REALM" \
  --username "$KEYCLOAK_TEST_USER_EMAIL" \
  --new-password "$KEYCLOAK_TEST_USER_PASSWORD"

"$KCADM" set-password -r "$REALM" \
  --username "$KEYCLOAK_TEST_COLLEAGUE_EMAIL" \
  --new-password "$KEYCLOAK_TEST_COLLEAGUE_PASSWORD"

"$KCADM" add-roles -r "$REALM" \
  --uusername "$KEYCLOAK_TEST_USER_EMAIL" \
  --rolename "$ROLE"

echo "Local Holedo Keycloak fixtures are ready"
