import React from 'react';
import './DeletionImpactDialog.scss';

export interface ImpactedEntity {
  entityType: string;
  count: number;
  description: string;
  relatedIds?: number[];
}

export interface DependencyItem {
  id: number;
  name: string;
  deleteEndpoint: string;
}

export interface BlockingDependency {
  entityType: string;
  description: string;
  items: DependencyItem[];
}

export interface DeletionImpactResult {
  canDelete: boolean;
  blockingReasons: string[];
  blockingDependencies?: BlockingDependency[];
  willBeDeleted: ImpactedEntity[];
  willBeAffected: ImpactedEntity[];
  warnings: string[];
}

interface DeletionImpactDialogProps {
  isOpen: boolean;
  entityName: string;
  impact: DeletionImpactResult | null;
  onConfirm: () => void;
  onCancel: () => void;
  onDeleteDependency?: (dependencyType: string, itemId: number, deleteEndpoint: string) => Promise<void>;
  onRefreshImpact?: () => Promise<void>;
  onDeleteAll?: () => Promise<void>;
  isLoading?: boolean;
}

const DeletionImpactDialog: React.FC<DeletionImpactDialogProps> = ({
  isOpen,
  entityName,
  impact,
  onConfirm,
  onCancel,
  onDeleteDependency,
  onRefreshImpact,
  onDeleteAll,
  isLoading = false
}) => {
  const [deletingDependency, setDeletingDependency] = React.useState<{ type: string; id: number } | null>(null);
  const [isDeletingAll, setIsDeletingAll] = React.useState(false);

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    if (!onDeleteDependency) return;
    
    setDeletingDependency({ type: dependencyType, id: itemId });
    try {
      await onDeleteDependency(dependencyType, itemId, deleteEndpoint);
      // Refresh impact check after deletion
      if (onRefreshImpact) {
        await onRefreshImpact();
      }
    } catch (error) {
      console.error('Error deleting dependency:', error);
    } finally {
      setDeletingDependency(null);
    }
  };
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content deletion-impact-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Confirm Deletion</h2>
          <button type="button" className="btn-close" onClick={onCancel} disabled={isLoading}>
            ×
          </button>
        </div>

        {!impact ? (
          <div className="deletion-loading">
            <div className="loading-spinner"></div>
            <p>Checking deletion impact...</p>
          </div>
        ) : !impact.canDelete ? (
          <div className="deletion-blocked">
            <div className="alert alert-danger">
              <div className="alert-icon">⚠️</div>
              <div className="alert-content">
                <strong>Cannot Delete {entityName}</strong>
                <p>The following dependencies prevent deletion:</p>
                
                {impact.blockingDependencies && impact.blockingDependencies.length > 0 ? (
                  <div className="blocking-dependencies">
                    {impact.blockingDependencies.map((dependency, depIdx) => (
                      <div key={depIdx} className="dependency-group">
                        <div className="dependency-header">
                          <strong>{dependency.entityType}:</strong> {dependency.description}
                        </div>
                        <ul className="dependency-items">
                          {dependency.items.slice(0, 3).map((item, itemIdx) => (
                            <li key={itemIdx} className="dependency-item">
                              <span className="dependency-name">{item.name}</span>
                              {onDeleteDependency && (
                                <button
                                  type="button"
                                  className="btn-delete-dependency"
                                  onClick={() => handleDeleteDependency(dependency.entityType, item.id, item.deleteEndpoint)}
                                  disabled={isLoading || (deletingDependency?.type === dependency.entityType && deletingDependency?.id === item.id)}
                                  title={`Delete ${item.name}`}
                                >
                                  {deletingDependency?.type === dependency.entityType && deletingDependency?.id === item.id ? (
                                    <span className="spinner-small"></span>
                                  ) : (
                                    '×'
                                  )}
                                </button>
                              )}
                            </li>
                          ))}
                          {dependency.items.length > 3 && (
                            <li className="dependency-item-more">
                              <span className="dependency-more-text">
                                ... and {dependency.items.length - 3} more {dependency.entityType.toLowerCase()}(s)
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="blocking-reasons">
                    {impact.blockingReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={onCancel} className="btn btn-secondary" disabled={isLoading || deletingDependency !== null || isDeletingAll}>
                Close
              </button>
              {onDeleteAll && impact.blockingDependencies && impact.blockingDependencies.length > 0 && (
                <button
                  onClick={async () => {
                    setIsDeletingAll(true);
                    try {
                      await onDeleteAll();
                    } finally {
                      setIsDeletingAll(false);
                    }
                  }}
                  className="btn btn-danger"
                  disabled={isLoading || deletingDependency !== null || isDeletingAll}
                >
                  {isDeletingAll ? 'Deleting All...' : 'Delete All (Dependencies + Order)'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="deletion-summary">
              <p className="confirmation-text">
                Are you sure you want to delete this <strong>{entityName}</strong>?
              </p>

              {impact.willBeDeleted.length > 0 && (
                <div className="impact-section">
                  <h3 className="impact-title">
                    <span className="icon">📋</span>
                    The following will be permanently deleted:
                  </h3>
                  <ul className="impact-list">
                    {impact.willBeDeleted.map((entity, idx) => (
                      <li key={idx}>
                        <strong>{entity.entityType}:</strong> {entity.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {impact.willBeAffected.length > 0 && (
                <div className="impact-section">
                  <h3 className="impact-title">
                    <span className="icon">⚠️</span>
                    The following will be affected:
                  </h3>
                  <ul className="impact-list">
                    {impact.willBeAffected.map((entity, idx) => (
                      <li key={idx}>
                        <strong>{entity.entityType}:</strong> {entity.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {impact.warnings.length > 0 && (
                <div className="impact-section warnings">
                  <h3 className="impact-title">
                    <span className="icon">⚠️</span>
                    Warnings:
                  </h3>
                  <ul className="impact-list">
                    {impact.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                onClick={onCancel}
                className="btn btn-secondary"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="btn btn-danger"
                disabled={isLoading}
              >
                {isLoading ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DeletionImpactDialog;

