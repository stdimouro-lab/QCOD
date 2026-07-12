import { useState, useMemo } from 'react';
import {
  statuses, project, getBuildings, getFloors, getFacilities, getRooms,
  getSections, getFloorsForBuilding, getSectionsForBuilding,
  getSectionsForFloor, getOutstandingSections, getBuildingTotals, getCampusSummary,
  getProjectTotals, pct, getValidAssets, getAssetIssueCounts, getImportStatus,
  getMappingHistory, getSectionHistory, getQcRecords, getResearchRecords,
  getRoomAssignmentHistory,
} from '../lib/data';
import { getRoomZone } from '../lib/roomAssignment';
import { exportReportToExcel } from '../lib/exportExcel';
import { exportReportToPdf } from '../lib/exportPdf';

const REPORTS = [
  { id: 'executive', label: 'Executive Summary', filters: [] },
  { id: 'campus', label: 'Campus Progress', filters: ['status'] },
  { id: 'building', label: 'Building Progress', filters: ['building'] },
  { id: 'floor', label: 'Floor Progress', filters: ['building', 'floor'] },
  { id: 'section', label: 'Section Progress', filters: ['building', 'floor', 'section', 'status'] },
  { id: 'outstanding', label: 'Outstanding Work', filters: ['building', 'floor', 'status'] },
  { id: 'assetInventory', label: 'Asset Inventory', filters: ['building', 'startDate', 'endDate'] },
  { id: 'assetIssues', label: 'Asset Issues', filters: ['building'] },
  { id: 'importStatus', label: 'Import Status', filters: [] },
  { id: 'facilityConfig', label: 'Facility Configuration', filters: [] },
  { id: 'buildingConfig', label: 'Building Configuration', filters: ['status'] },
  { id: 'floorConfig', label: 'Floor Configuration', filters: ['building', 'status'] },
  { id: 'sectionConfig', label: 'Section Configuration', filters: ['building', 'floor', 'status'] },
  { id: 'roomConfig', label: 'Room Configuration', filters: ['building', 'floor', 'section', 'status'] },
  { id: 'assetMapping', label: 'Asset Mapping', filters: ['building'] },
  { id: 'mappingHistory', label: 'Mapping History', filters: ['startDate', 'endDate'] },
  { id: 'sectionHistory', label: 'Section History', filters: ['startDate', 'endDate'] },
  { id: 'qcRecords', label: 'QC Records', filters: ['building', 'startDate', 'endDate'] },
  { id: 'researchRecords', label: 'Research Records', filters: ['building', 'startDate', 'endDate'] },
  { id: 'roomDirectory500', label: 'Building 500 Room Directory', filters: ['floor'] },
  { id: 'roomsByFloor', label: 'Rooms by Floor', filters: ['building', 'floor'] },
  { id: 'roomsBySection', label: 'Rooms by Section', filters: ['building', 'floor', 'section'] },
  { id: 'unassignedRooms', label: 'Unassigned Rooms', filters: ['building', 'floor'] },
  { id: 'roomsNeedingReview', label: 'Rooms Needing Review', filters: ['building', 'floor'] },
  { id: 'roomAssignmentHistory', label: 'Room Assignment History', filters: ['startDate', 'endDate'] },
  { id: 'sectionRoomMatrix', label: 'Section-to-Room Matrix', filters: ['building', 'floor', 'section'] },
];

function statusLabel(key) {
  return statuses[key]?.label ?? key;
}

function inDateRange(dateStr, start, end) {
  if (!dateStr) return !start && !end; // no date on the record — only include if no range is set
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

function buildReport(reportId, filters) {
  const sections = getSections();
  const buildings = getBuildings();
  const floors = getFloors();

  switch (reportId) {
    case 'executive': {
      const summary = getCampusSummary();
      const totals = getProjectTotals();
      const importStatus = getImportStatus();
      const assetProgress = pct(totals.tagged, totals.expected);
      const columns = [{ header: 'Metric', key: 'metric' }, { header: 'Value', key: 'value' }];
      const rows = [
        { metric: 'Buildings Configured', value: summary.buildingsConfigured },
        { metric: 'Buildings In Progress', value: summary.buildingsInProgress },
        { metric: 'Buildings Complete', value: summary.buildingsComplete },
        { metric: 'Floors Configured', value: summary.floorsConfigured },
        { metric: 'Sections Configured', value: summary.sectionsConfigured },
        { metric: 'Sections Complete', value: summary.sectionsComplete },
        { metric: 'Section Progress', value: `${totals.sectionProgress}%` },
        { metric: 'Asset Progress', value: assetProgress === null ? 'Pending' : `${assetProgress}%` },
        { metric: 'Return Needed', value: summary.returnNeeded },
        { metric: 'No Access', value: summary.noAccess },
        { metric: 'Asset Import Status', value: importStatus.lastAssetImport || 'Not Imported' },
        { metric: 'Last Section Update', value: importStatus.lastSectionImport || 'Not Imported' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: null };
    }

    case 'campus': {
      let rows = buildings.map((b) => {
        const totals = getBuildingTotals(b.id);
        const ap = pct(totals.tagged, totals.expected);
        return {
          building: `${b.id} — ${b.name}`,
          status: statusLabel(b.status),
          sections: totals.sectionCount,
          sectionProgress: `${totals.sectionProgress}%`,
          assetProgress: ap === null ? 'Pending' : `${ap}%`,
        };
      });
      if (filters.status) rows = rows.filter((r) => r.status === statusLabel(filters.status));
      const columns = [
        { header: 'Building', key: 'building' }, { header: 'Status', key: 'status' },
        { header: 'Sections', key: 'sections' }, { header: 'Section Progress', key: 'sectionProgress' },
        { header: 'Asset Progress', key: 'assetProgress' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No buildings matched the selected filters.' };
    }

    case 'building': {
      const buildingId = filters.building || project.focusBuilding;
      const building = buildings.find((b) => b.id === buildingId);
      const buildingFloors = getFloorsForBuilding(buildingId);
      const rows = buildingFloors.map((f) => {
        const fSections = getSectionsForFloor(f.id);
        const avgPct = fSections.length
          ? Math.round(fSections.reduce((s, sec) => s + (sec.completionPct || 0), 0) / fSections.length)
          : 0;
        return {
          floor: f.name, status: statusLabel(f.status), sections: fSections.length, sectionProgress: `${avgPct}%`,
        };
      });
      const columns = [
        { header: 'Floor', key: 'floor' }, { header: 'Status', key: 'status' },
        { header: 'Tracked Sections', key: 'sections' }, { header: 'Section Progress', key: 'sectionProgress' },
      ];
      return {
        columns, rows,
        summaryLines: [`Building: ${building ? `${building.id} — ${building.name}` : buildingId}`],
        emptyMessage: 'No floors configured for this building.',
      };
    }

    case 'floor': {
      const buildingId = filters.building || project.focusBuilding;
      let scopeFloors = getFloorsForBuilding(buildingId);
      if (filters.floor) scopeFloors = scopeFloors.filter((f) => f.id === filters.floor);
      const rows = scopeFloors.map((f) => {
        const fSections = getSectionsForFloor(f.id);
        const avgPct = fSections.length
          ? Math.round(fSections.reduce((s, sec) => s + (sec.completionPct || 0), 0) / fSections.length)
          : 0;
        return {
          floor: f.name, status: statusLabel(f.status), sections: fSections.length,
          sectionProgress: `${avgPct}%`, notes: f.mapNotes || '',
        };
      });
      const columns = [
        { header: 'Floor', key: 'floor' }, { header: 'Status', key: 'status' },
        { header: 'Tracked Sections', key: 'sections' }, { header: 'Section Progress', key: 'sectionProgress' },
        { header: 'Notes', key: 'notes' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No floors matched the selected filters.' };
    }

    case 'section': {
      let scoped = sections;
      if (filters.building) scoped = scoped.filter((s) => s.buildingId === filters.building);
      if (filters.floor) scoped = scoped.filter((s) => s.floorId === filters.floor);
      if (filters.section) scoped = scoped.filter((s) => s.id === filters.section);
      if (filters.status) scoped = scoped.filter((s) => s.status === filters.status);
      const rows = scoped.map((s) => ({
        floor: floors.find((f) => f.id === s.floorId)?.name ?? s.floorId,
        section: s.name,
        status: statusLabel(s.status),
        completionPct: `${s.completionPct || 0}%`,
        expectedAssets: s.expectedAssets || 'Pending',
        tagged: s.taggedAssets || 'Pending',
        lastUpdate: s.lastUpdate || 'Not Updated',
        notes: s.notes || '',
      }));
      const columns = [
        { header: 'Floor', key: 'floor' }, { header: 'Section', key: 'section' },
        { header: 'Status', key: 'status' }, { header: 'Section Progress', key: 'completionPct' },
        { header: 'Expected Assets', key: 'expectedAssets' }, { header: 'Tagged', key: 'tagged' },
        { header: 'Last Updated', key: 'lastUpdate' }, { header: 'Notes', key: 'notes' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No sections matched the selected filters.' };
    }

    case 'outstanding': {
      let outstanding = getOutstandingSections(sections);
      if (filters.building) outstanding = outstanding.filter((s) => s.buildingId === filters.building);
      if (filters.floor) outstanding = outstanding.filter((s) => s.floorId === filters.floor);
      if (filters.status) outstanding = outstanding.filter((s) => s.status === filters.status);
      const rows = outstanding.map((s) => ({
        building: s.buildingId,
        floor: floors.find((f) => f.id === s.floorId)?.name ?? s.floorId,
        section: s.name,
        status: statusLabel(s.status),
        completionPct: `${s.completionPct || 0}%`,
        lastUpdate: s.lastUpdate || 'Not Updated',
        notes: s.notes || '',
      }));
      const columns = [
        { header: 'Building', key: 'building' }, { header: 'Floor', key: 'floor' },
        { header: 'Section', key: 'section' }, { header: 'Status', key: 'status' },
        { header: 'Completion Percent', key: 'completionPct' }, { header: 'Last Updated', key: 'lastUpdate' },
        { header: 'Notes', key: 'notes' },
      ];
      return {
        columns, rows, summaryLines: [],
        emptyMessage: 'No outstanding sections were recorded at the time this report was generated.',
      };
    }

    case 'assetInventory': {
      let valid = getValidAssets();
      if (filters.building) valid = valid.filter((a) => a.buildingId === filters.building);
      if (filters.startDate || filters.endDate) {
        valid = valid.filter((a) => inDateRange(a.lastInventoried, filters.startDate, filters.endDate));
      }
      const rows = valid.map((a) => ({
        assetNumber: a.assetNumber, serialNumber: a.serialNumber || 'Pending',
        description: a.description, locationName: a.locationName,
        lastInventoried: a.lastInventoried || 'Pending',
        building: a.buildingId || 'Unmapped',
      }));
      const columns = [
        { header: 'Asset Number', key: 'assetNumber' }, { header: 'Serial Number', key: 'serialNumber' },
        { header: 'Description', key: 'description' }, { header: 'Location Name', key: 'locationName' },
        { header: 'Last Inventoried', key: 'lastInventoried' }, { header: 'Building', key: 'building' },
      ];
      return {
        columns, rows,
        summaryLines: [`Total valid assets: ${valid.length}`],
        emptyMessage: 'No assets have been imported yet.',
      };
    }

    case 'assetIssues': {
      let valid = getValidAssets().filter((a) => Array.isArray(a.issueTypes) && a.issueTypes.length > 0);
      if (filters.building) valid = valid.filter((a) => a.buildingId === filters.building);
      const issueLabel = { missing_serial_number: 'Missing Serial Number', not_found_in_db: 'Not Found in DB', new_asset_offline_sync: 'New Asset / Offline Sync' };
      const rows = valid.map((a) => ({
        assetNumber: a.assetNumber, serialNumber: a.serialNumber || 'Pending',
        description: a.description, locationName: a.locationName,
        lastInventoried: a.lastInventoried || 'Pending',
        issueTypes: (a.issueTypes || []).map((t) => issueLabel[t] ?? t).join(', '),
      }));
      const counts = getAssetIssueCounts();
      const columns = [
        { header: 'Asset Number', key: 'assetNumber' }, { header: 'Serial Number', key: 'serialNumber' },
        { header: 'Description', key: 'description' }, { header: 'Location Name', key: 'locationName' },
        { header: 'Last Inventoried', key: 'lastInventoried' }, { header: 'Issue Types', key: 'issueTypes' },
      ];
      return {
        columns, rows,
        summaryLines: [
          `Missing Serial Number: ${counts.missingSerialNumber}`,
          `Not Found in DB: ${counts.notFoundInDatabase}`,
          `New Asset / Offline Sync: ${counts.newAssetOfflineSync}`,
        ],
        emptyMessage: 'No asset issues were recorded at the time this report was generated.',
      };
    }

    case 'importStatus': {
      const s = getImportStatus();
      const columns = [{ header: 'Field', key: 'field' }, { header: 'Value', key: 'value' }];
      const rows = [
        { field: 'Last Asset Import', value: s.lastAssetImport || 'Not Imported' },
        { field: 'Last Section Import', value: s.lastSectionImport || 'Not Imported' },
        { field: 'Last Configuration Import', value: s.lastConfigImport || 'Not Imported' },
        { field: 'Last Backup Export', value: s.lastBackupExport || 'Not Imported' },
        { field: 'Assets Imported', value: s.assetsImported || 0 },
        { field: 'Assets Mapped', value: s.assetsMapped || 0 },
        { field: 'Assets Unmapped', value: s.assetsUnmapped || 0 },
        { field: 'Sections Updated', value: s.sectionsUpdated || 0 },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: null };
    }

    case 'facilityConfig': {
      const rows = getFacilities().map((f) => ({ id: f.id, name: f.name, city: f.city, state: f.state, status: statusLabel(f.status), notes: f.notes || '' }));
      const columns = [
        { header: 'Facility ID', key: 'id' }, { header: 'Name', key: 'name' }, { header: 'City', key: 'city' },
        { header: 'State', key: 'state' }, { header: 'Status', key: 'status' }, { header: 'Notes', key: 'notes' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No facilities configured.' };
    }

    case 'buildingConfig': {
      let rows = buildings;
      if (filters.status) rows = rows.filter((b) => b.status === filters.status);
      const mapped = rows.map((b) => ({ id: b.id, facilityId: b.facilityId, name: b.name, status: statusLabel(b.status), configured: b.configured ? 'Yes' : 'No', notes: b.notes || '' }));
      const columns = [
        { header: 'Building ID', key: 'id' }, { header: 'Facility', key: 'facilityId' }, { header: 'Name', key: 'name' },
        { header: 'Status', key: 'status' }, { header: 'Configured', key: 'configured' }, { header: 'Notes', key: 'notes' },
      ];
      return { columns, rows: mapped, summaryLines: [], emptyMessage: 'No buildings matched the selected filters.' };
    }

    case 'floorConfig': {
      let rows = filters.building ? getFloorsForBuilding(filters.building) : floors;
      if (filters.status) rows = rows.filter((f) => f.status === filters.status);
      const mapped = rows.map((f) => ({ id: f.id, buildingId: f.buildingId, name: f.name, level: f.level, status: statusLabel(f.status), notes: f.notes || f.mapNotes || '' }));
      const columns = [
        { header: 'Floor ID', key: 'id' }, { header: 'Building', key: 'buildingId' }, { header: 'Name', key: 'name' },
        { header: 'Level', key: 'level' }, { header: 'Status', key: 'status' }, { header: 'Notes', key: 'notes' },
      ];
      return { columns, rows: mapped, summaryLines: [], emptyMessage: 'No floors matched the selected filters.' };
    }

    case 'sectionConfig': {
      let rows = sections;
      if (filters.building) rows = rows.filter((s) => s.buildingId === filters.building);
      if (filters.floor) rows = rows.filter((s) => s.floorId === filters.floor);
      if (filters.status) rows = rows.filter((s) => s.status === filters.status);
      const mapped = rows.map((s) => ({ id: s.id, buildingId: s.buildingId, floorId: s.floorId, name: s.name, status: statusLabel(s.status), completionPct: `${s.completionPct || 0}%`, lastUpdate: s.lastUpdate || 'Not Updated' }));
      const columns = [
        { header: 'Section ID', key: 'id' }, { header: 'Building', key: 'buildingId' }, { header: 'Floor', key: 'floorId' },
        { header: 'Name', key: 'name' }, { header: 'Status', key: 'status' }, { header: 'Completion', key: 'completionPct' },
        { header: 'Last Updated', key: 'lastUpdate' },
      ];
      return { columns, rows: mapped, summaryLines: [], emptyMessage: 'No sections matched the selected filters.' };
    }

    case 'roomConfig': {
      let rows = getRooms();
      if (filters.building) rows = rows.filter((r) => r.buildingId === filters.building);
      if (filters.floor) rows = rows.filter((r) => r.floorId === filters.floor);
      if (filters.section) rows = rows.filter((r) => r.sectionId === filters.section);
      if (filters.status) rows = rows.filter((r) => r.status === filters.status);
      const mapped = rows.map((r) => ({ id: r.id, buildingId: r.buildingId, floorId: r.floorId, sectionId: r.sectionId, roomNumber: r.roomNumber, name: r.roomName, status: statusLabel(r.status), lastUpdate: r.lastUpdate || 'Not Updated' }));
      const columns = [
        { header: 'Room ID', key: 'id' }, { header: 'Building', key: 'buildingId' }, { header: 'Floor', key: 'floorId' },
        { header: 'Section', key: 'sectionId' }, { header: 'Room Number', key: 'roomNumber' }, { header: 'Name', key: 'name' },
        { header: 'Status', key: 'status' }, { header: 'Last Updated', key: 'lastUpdate' },
      ];
      return { columns, rows: mapped, summaryLines: [], emptyMessage: 'No room data has been configured for this selection.' };
    }

    case 'assetMapping': {
      let assets = getValidAssets().filter((a) => a.buildingId);
      if (filters.building) assets = assets.filter((a) => a.buildingId === filters.building);
      const rows = assets.map((a) => ({ assetNumber: a.assetNumber, buildingId: a.buildingId, floorId: a.floorId || 'Unmapped', sectionId: a.sectionId || 'Unmapped', roomId: a.roomId || 'Unmapped', locationName: a.locationName }));
      const columns = [
        { header: 'Asset Number', key: 'assetNumber' }, { header: 'Building', key: 'buildingId' }, { header: 'Floor', key: 'floorId' },
        { header: 'Section', key: 'sectionId' }, { header: 'Room', key: 'roomId' }, { header: 'Location Name', key: 'locationName' },
      ];
      return { columns, rows, summaryLines: [`Mapped assets: ${rows.length}`], emptyMessage: 'No assets have been mapped yet.' };
    }

    case 'mappingHistory': {
      let history = getMappingHistory();
      if (filters.startDate) history = history.filter((h) => h.mappedAt >= filters.startDate);
      if (filters.endDate) history = history.filter((h) => h.mappedAt <= filters.endDate + 'T23:59:59');
      const rows = history.map((h) => ({
        date: new Date(h.mappedAt).toLocaleString(), assetNumber: h.assetNumber,
        previous: [h.previousMapping.buildingId, h.previousMapping.floorId, h.previousMapping.sectionId, h.previousMapping.roomId].filter(Boolean).join(' / ') || 'None',
        newMapping: [h.newMapping.buildingId, h.newMapping.floorId, h.newMapping.sectionId, h.newMapping.roomId].filter(Boolean).join(' / ') || 'None',
        source: h.source,
      }));
      const columns = [
        { header: 'Date', key: 'date' }, { header: 'Asset Number', key: 'assetNumber' },
        { header: 'Previous Mapping', key: 'previous' }, { header: 'New Mapping', key: 'newMapping' }, { header: 'Source', key: 'source' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No mapping changes recorded yet.' };
    }

    case 'sectionHistory': {
      let history = getSectionHistory();
      if (filters.startDate) history = history.filter((h) => h.updatedAt >= filters.startDate);
      if (filters.endDate) history = history.filter((h) => h.updatedAt <= filters.endDate + 'T23:59:59');
      const rows = history.map((h) => ({
        date: new Date(h.updatedAt).toLocaleString(), sectionId: h.sectionId,
        previousStatus: statusLabel(h.previousStatus), newStatus: statusLabel(h.newStatus),
        previousPct: `${h.previousCompletionPct}%`, newPct: `${h.newCompletionPct}%`, note: h.note || '',
      }));
      const columns = [
        { header: 'Date', key: 'date' }, { header: 'Section', key: 'sectionId' }, { header: 'Previous Status', key: 'previousStatus' },
        { header: 'New Status', key: 'newStatus' }, { header: 'Previous %', key: 'previousPct' }, { header: 'New %', key: 'newPct' }, { header: 'Note', key: 'note' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No section status changes recorded yet.' };
    }

    case 'qcRecords': {
      let rows = getQcRecords();
      if (filters.building) rows = rows.filter((r) => r['Building'] === filters.building);
      if (filters.startDate) rows = rows.filter((r) => (r['Date'] || '') >= filters.startDate);
      if (filters.endDate) rows = rows.filter((r) => (r['Date'] || '') <= filters.endDate);
      const columns = ['Date', 'Facility', 'Building', 'Floor', 'Section', 'Department Area', 'Tag Location', 'Equipment Description', 'EE Tag Number', 'Serial Number', 'QC Status', 'Notes']
        .map((h) => ({ header: h, key: h }));
      return { columns, rows, summaryLines: [], emptyMessage: 'No QC records have been imported yet.' };
    }

    case 'researchRecords': {
      let rows = getResearchRecords();
      if (filters.building) rows = rows.filter((r) => r['Building'] === filters.building);
      if (filters.startDate) rows = rows.filter((r) => (r['Date Found'] || '') >= filters.startDate);
      if (filters.endDate) rows = rows.filter((r) => (r['Date Found'] || '') <= filters.endDate);
      const columns = ['Date Found', 'Facility', 'Building', 'Floor', 'Section', 'Asset Number', 'Serial Number', 'Description', 'Issue Type', 'Status', 'Notes']
        .map((h) => ({ header: h, key: h }));
      return { columns, rows, summaryLines: [], emptyMessage: 'No Research records have been imported yet.' };
    }

    case 'roomDirectory500': {
      let rows = getRooms().filter((r) => r.buildingId === '500');
      if (filters.floor) rows = rows.filter((r) => r.floorId === filters.floor);
      const mapped = rows.map((r) => ({
        floorId: r.floorId, zone: getRoomZone(r.roomNumber), roomNumber: r.roomNumber, roomName: r.roomName,
        roomType: r.roomType || '', sectionId: r.sectionId || 'Unassigned', assignmentStatus: r.assignmentStatus,
        confidence: r.assignmentConfidence, source: r.sourceDocument || '',
      }));
      const columns = [
        { header: 'Floor', key: 'floorId' }, { header: 'Zone', key: 'zone' }, { header: 'Room Number', key: 'roomNumber' },
        { header: 'Room Name', key: 'roomName' }, { header: 'Room Type', key: 'roomType' }, { header: 'Section', key: 'sectionId' },
        { header: 'Assignment Status', key: 'assignmentStatus' }, { header: 'Confidence', key: 'confidence' }, { header: 'Source Document', key: 'source' },
      ];
      return { columns, rows: mapped, summaryLines: [`Total Building 500 rooms: ${mapped.length}`], emptyMessage: 'No Building 500 rooms have been extracted or imported yet.' };
    }

    case 'roomsByFloor': {
      let rows = getRooms();
      if (filters.building) rows = rows.filter((r) => r.buildingId === filters.building);
      if (filters.floor) rows = rows.filter((r) => r.floorId === filters.floor);
      const mapped = rows
        .slice()
        .sort((a, b) => (a.floorId || '').localeCompare(b.floorId || ''))
        .map((r) => ({ floorId: r.floorId, roomNumber: r.roomNumber, roomName: r.roomName, roomType: r.roomType || '', assignmentStatus: r.assignmentStatus, status: statusLabel(r.status) }));
      const columns = [
        { header: 'Floor', key: 'floorId' }, { header: 'Room Number', key: 'roomNumber' }, { header: 'Room Name', key: 'roomName' },
        { header: 'Room Type', key: 'roomType' }, { header: 'Assignment Status', key: 'assignmentStatus' }, { header: 'Operational Status', key: 'status' },
      ];
      return { columns, rows: mapped, summaryLines: [], emptyMessage: 'No rooms matched the selected filters.' };
    }

    case 'roomsBySection': {
      let rows = getRooms().filter((r) => r.sectionId);
      if (filters.building) rows = rows.filter((r) => r.buildingId === filters.building);
      if (filters.floor) rows = rows.filter((r) => r.floorId === filters.floor);
      if (filters.section) rows = rows.filter((r) => r.sectionId === filters.section);
      const mapped = rows
        .slice()
        .sort((a, b) => (a.sectionId || '').localeCompare(b.sectionId || ''))
        .map((r) => ({ sectionId: r.sectionId, roomNumber: r.roomNumber, roomName: r.roomName, assignmentStatus: r.assignmentStatus, confidence: r.assignmentConfidence, status: statusLabel(r.status) }));
      const columns = [
        { header: 'Section', key: 'sectionId' }, { header: 'Room Number', key: 'roomNumber' }, { header: 'Room Name', key: 'roomName' },
        { header: 'Assignment Status', key: 'assignmentStatus' }, { header: 'Confidence', key: 'confidence' }, { header: 'Operational Status', key: 'status' },
      ];
      return { columns, rows: mapped, summaryLines: [], emptyMessage: 'No rooms are assigned to a section yet.' };
    }

    case 'unassignedRooms': {
      let rows = getRooms().filter((r) => r.assignmentStatus === 'unassigned');
      if (filters.building) rows = rows.filter((r) => r.buildingId === filters.building);
      if (filters.floor) rows = rows.filter((r) => r.floorId === filters.floor);
      const mapped = rows.map((r) => ({ floorId: r.floorId, zone: getRoomZone(r.roomNumber), roomNumber: r.roomNumber, roomName: r.roomName, roomType: r.roomType || '', reason: r.assignmentReason || '' }));
      const columns = [
        { header: 'Floor', key: 'floorId' }, { header: 'Zone', key: 'zone' }, { header: 'Room Number', key: 'roomNumber' },
        { header: 'Room Name', key: 'roomName' }, { header: 'Room Type', key: 'roomType' }, { header: 'Reason', key: 'reason' },
      ];
      return { columns, rows: mapped, summaryLines: [`Unassigned rooms: ${mapped.length}`], emptyMessage: 'No unassigned rooms — every room has a section.' };
    }

    case 'roomsNeedingReview': {
      let rows = getRooms().filter((r) => r.assignmentStatus === 'needs_review' || r.assignmentStatus === 'suggested');
      if (filters.building) rows = rows.filter((r) => r.buildingId === filters.building);
      if (filters.floor) rows = rows.filter((r) => r.floorId === filters.floor);
      const mapped = rows.map((r) => ({ floorId: r.floorId, zone: getRoomZone(r.roomNumber), roomNumber: r.roomNumber, roomName: r.roomName, suggestedSection: r.sectionId || '', confidence: r.assignmentConfidence, reason: r.assignmentReason || '' }));
      const columns = [
        { header: 'Floor', key: 'floorId' }, { header: 'Zone', key: 'zone' }, { header: 'Room Number', key: 'roomNumber' },
        { header: 'Room Name', key: 'roomName' }, { header: 'Suggested Section', key: 'suggestedSection' },
        { header: 'Confidence', key: 'confidence' }, { header: 'Reason', key: 'reason' },
      ];
      return { columns, rows: mapped, summaryLines: [`Rooms needing review: ${mapped.length}`], emptyMessage: 'No rooms are currently flagged for review.' };
    }

    case 'roomAssignmentHistory': {
      let history = getRoomAssignmentHistory();
      if (filters.startDate) history = history.filter((h) => h.updatedAt >= filters.startDate);
      if (filters.endDate) history = history.filter((h) => h.updatedAt <= filters.endDate + 'T23:59:59');
      const mapped = history.map((h) => ({
        date: new Date(h.updatedAt).toLocaleString(), roomId: h.roomId,
        previousSection: h.previousSectionId || 'None', newSection: h.newSectionId || 'None',
        previousStatus: h.previousStatus, newStatus: h.newStatus, confidence: h.confidence || '', source: h.source,
      }));
      const columns = [
        { header: 'Date', key: 'date' }, { header: 'Room', key: 'roomId' }, { header: 'Previous Section', key: 'previousSection' },
        { header: 'New Section', key: 'newSection' }, { header: 'Previous Status', key: 'previousStatus' },
        { header: 'New Status', key: 'newStatus' }, { header: 'Confidence', key: 'confidence' }, { header: 'Source', key: 'source' },
      ];
      return { columns, rows: mapped, summaryLines: [], emptyMessage: 'No room assignment changes recorded yet.' };
    }

    case 'sectionRoomMatrix': {
      let rows = getRooms().filter((r) => r.sectionId);
      if (filters.building) rows = rows.filter((r) => r.buildingId === filters.building);
      if (filters.floor) rows = rows.filter((r) => r.floorId === filters.floor);
      if (filters.section) rows = rows.filter((r) => r.sectionId === filters.section);
      const mapped = rows.map((r) => ({
        facilityId: r.facilityId, buildingId: r.buildingId, floorId: r.floorId, sectionId: r.sectionId,
        roomNumber: r.roomNumber, roomName: r.roomName, assignmentStatus: r.assignmentStatus,
        confidence: r.assignmentConfidence, source: r.assignmentSource,
      }));
      const columns = [
        { header: 'Facility', key: 'facilityId' }, { header: 'Building', key: 'buildingId' }, { header: 'Floor', key: 'floorId' },
        { header: 'Section', key: 'sectionId' }, { header: 'Room Number', key: 'roomNumber' }, { header: 'Room Name', key: 'roomName' },
        { header: 'Assignment Status', key: 'assignmentStatus' }, { header: 'Confidence', key: 'confidence' }, { header: 'Assignment Source', key: 'source' },
      ];
      return { columns, rows: mapped, summaryLines: [], emptyMessage: 'No rooms are assigned to a section yet.' };
    }

    default:
      return { columns: [], rows: [], summaryLines: [], emptyMessage: 'Unknown report.' };
  }
}

export default function ReportCenter({ defaultFacilityId }) {
  const [reportId, setReportId] = useState('executive');
  const [filters, setFilters] = useState({});

  const buildings = getBuildings().filter((b) => !defaultFacilityId || b.facilityId === defaultFacilityId);
  const report = REPORTS.find((r) => r.id === reportId);
  const buildingId = filters.building || '';
  const scopedFloors = buildingId ? getFloorsForBuilding(buildingId) : getFloors();
  const scopedSections = buildingId ? getSectionsForBuilding(buildingId) : getSections();

  const { columns, rows, summaryLines, emptyMessage } = useMemo(
    () => buildReport(reportId, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportId, filters]
  );

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const handleReportChange = (id) => {
    setReportId(id);
    setFilters({});
  };

  return (
    <section className="panel">
      <h2>Reports</h2>
      <p className="local-only-note">
        QCOD currently runs locally. Selected files are processed in this browser and are not uploaded to a server.
      </p>

      <div className="import-controls">
        <label>
          Report
          <select value={reportId} onChange={(e) => handleReportChange(e.target.value)}>
            {REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>

        {report.filters.includes('building') && (
          <label>
            Building
            <select value={filters.building || ''} onChange={(e) => setFilter('building', e.target.value)}>
              <option value="">All Buildings</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
          </label>
        )}

        {report.filters.includes('floor') && (
          <label>
            Floor
            <select value={filters.floor || ''} onChange={(e) => setFilter('floor', e.target.value)}>
              <option value="">All Floors</option>
              {scopedFloors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}

        {report.filters.includes('section') && (
          <label>
            Section
            <select value={filters.section || ''} onChange={(e) => setFilter('section', e.target.value)}>
              <option value="">All Sections</option>
              {scopedSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        {report.filters.includes('status') && (
          <label>
            Status
            <select value={filters.status || ''} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All Statuses</option>
              {Object.keys(statuses).map((key) => <option key={key} value={key}>{statuses[key].label}</option>)}
            </select>
          </label>
        )}

        {report.filters.includes('startDate') && (
          <label>
            Start date
            <input type="date" value={filters.startDate || ''} onChange={(e) => setFilter('startDate', e.target.value)} />
          </label>
        )}

        {report.filters.includes('endDate') && (
          <label>
            End date
            <input type="date" value={filters.endDate || ''} onChange={(e) => setFilter('endDate', e.target.value)} />
          </label>
        )}
      </div>

      <div className="import-actions">
        <button
          className="btn-primary"
          onClick={() => exportReportToExcel({ reportName: report.label, filters, columns, rows, summaryLines })}
        >
          Export Excel
        </button>
        <button
          className="btn-secondary"
          onClick={() => exportReportToPdf({ reportName: report.label, filters, columns, rows, summaryLines, emptyMessage })}
        >
          Export PDF
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="empty-note">{emptyMessage}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key}>{row[c.key]}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && <p className="empty-note">Showing first 50 of {rows.length} rows. Export for the full report.</p>}
        </div>
      )}
    </section>
  );
}
