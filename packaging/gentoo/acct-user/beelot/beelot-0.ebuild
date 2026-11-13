# Copyright 2026 Beelot
# Distributed under the terms of the GNU Affero General Public License v3 or later

EAPI=8

inherit acct-user

DESCRIPTION="User for the Beelot card game server"
ACCT_USER_ID=-1
ACCT_USER_HOME=/dev/null
ACCT_USER_GROUPS=( beelot )

acct-user_add_deps
