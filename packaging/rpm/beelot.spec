# Beelot's RPM (US-133). It packs what the release build already made: build-rpm.sh passes the version and the
# directory of the sources, and rpmbuild runs in a Fedora container (see .github/scripts/build-rpm.sh).
%global debug_package %{nil}
%global __strip /bin/true

Name:           beelot
Version:        %{beelot_version}
Release:        1
Summary:        A Belote card game server
License:        AGPL-3.0-or-later
URL:            https://github.com/mederel/beelot
BuildArch:      x86_64
# useradd and groupadd; the unit is installed with the systemd macros.
Requires(pre):  shadow-utils
Requires:       systemd
# The database is never a hard requirement: the operator may use one on another machine.
Recommends:     mariadb-server
%{?systemd_requires}
BuildRequires:  systemd-rpm-macros

%description
A Belote card game: play against bots, with friends at a private table or on one device. This package runs its web
server as a systemd service; it needs a MariaDB database, which it does not create.

%prep

%build

%install
install -D -m 0755 %{beelot_root}/target/release/beelot-server %{buildroot}%{_bindir}/beelot-server
install -d %{buildroot}%{_datadir}/beelot
cp -r %{beelot_root}/crates/beelot-server/static %{buildroot}%{_datadir}/beelot/static
find %{buildroot}%{_datadir}/beelot/static -type d -exec chmod 0755 {} +
find %{buildroot}%{_datadir}/beelot/static -type f -exec chmod 0644 {} +
install -D -m 0644 %{beelot_root}/packaging/debian/beelot.service %{buildroot}%{_unitdir}/beelot.service
install -D -m 0640 %{beelot_root}/packaging/debian/beelot.env %{buildroot}%{_sysconfdir}/beelot/beelot.env
install -D -m 0644 %{beelot_root}/README.md %{buildroot}%{_docdir}/beelot/README.md

%pre
getent group beelot > /dev/null || groupadd --system beelot
getent passwd beelot > /dev/null || \
    useradd --system --gid beelot --no-create-home --home-dir /nonexistent --shell /sbin/nologin beelot
exit 0

# Not enabled or started by the install, as RPM packaging asks: the database may not exist yet.
%post
%systemd_post beelot.service

%preun
%systemd_preun beelot.service

%postun
%systemd_postun_with_restart beelot.service

%files
%{_bindir}/beelot-server
%{_datadir}/beelot
%{_unitdir}/beelot.service
%dir %attr(0750,root,beelot) %{_sysconfdir}/beelot
%config(noreplace) %attr(0640,root,beelot) %{_sysconfdir}/beelot/beelot.env
%doc %{_docdir}/beelot/README.md

%changelog
* Fri Nov 13 2026 Beelot <mederel@users.noreply.github.com> - %{version}-1
- Release v%{version}, see https://github.com/mederel/beelot/releases/tag/v%{version}
