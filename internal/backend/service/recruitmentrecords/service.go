// Package recruitmentrecords exposes retained records without the retired workflow services.
// All datasets and SQL projections are fixed here; callers cannot choose tables or SQL.
package recruitmentrecords

import (
	"context"
	"errors"
	"strconv"
	"time"

	"gorm.io/gorm"
)

var ErrForbidden = errors.New("仅超级管理员可查看保留记录")
var ErrInvalid = errors.New("档案类别或分页参数不合法")

const PageSize = 25

type Dataset struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}
type dataset struct {
	Dataset
	from, columns string
}

// The first selected column must be the primary key used for keyset pagination.
var datasets = []dataset{
	{Dataset{"recruitment", "历史报名"}, "registration_legacy_archives r",
		"r.id AS 报名编号, r.form_id AS 报名表编号, r.form_title AS 报名表, r.user_id AS 成员编号, r.applicant_name AS 姓名, r.main_group_id AS 主要组别编号, r.main_group_name AS 主要组别, CASE r.group_source WHEN 'final' THEN '最终录取组' WHEN 'preferred' THEN '意向组' WHEN 'first' THEN '第一志愿' ELSE '未记录' END AS 组别依据, CASE r.final_status WHEN 1 THEN '录取' WHEN 2 THEN '拒绝' ELSE '未确定' END AS 旧最终结果, CASE r.recruitment_status WHEN 'admitted' THEN '录取' WHEN 'rejected' THEN '拒绝' WHEN 'withdrawn' THEN '撤回' WHEN 'pending_interview' THEN '待面试' WHEN 'pending_screening' THEN '待初筛' ELSE r.recruitment_status END AS 归档时现行结果, r.submitted_at AS 报名时间"},
	{Dataset{"cultivation-notes", "培养备注"}, "member_cultivation_records r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN user_groups g ON g.id=r.group_id",
		"r.id AS 编号, r.group_id AS 组别编号, g.name AS 组别, r.user_id AS 成员编号, u.real_name AS 当前姓名, r.focused AS 关注标记, r.internal_note AS 备注, r.updated_by AS 更新人编号, r.updated_by_name AS 更新人, r.updated_at AS 更新时间"},
}

type Page struct {
	Datasets   []Dataset  `json:"datasets"`
	Columns    []string   `json:"columns"`
	Rows       [][]string `json:"rows"`
	NextCursor string     `json:"nextCursor"`
}
type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

func (s *Service) List(ctx context.Context, role, key, cursor string) (*Page, error) {
	if role != "super_admin" {
		return nil, ErrForbidden
	}
	var spec *dataset
	page := &Page{Datasets: make([]Dataset, 0, len(datasets)), Rows: make([][]string, 0, PageSize)}
	for i := range datasets {
		page.Datasets = append(page.Datasets, datasets[i].Dataset)
		if datasets[i].Key == key {
			spec = &datasets[i]
		}
	}
	if spec == nil {
		return nil, ErrInvalid
	}
	var before uint64
	if cursor != "" {
		var err error
		before, err = strconv.ParseUint(cursor, 10, 64)
		if err != nil || before == 0 {
			return nil, ErrInvalid
		}
	}
	query := s.db.WithContext(ctx).Table(spec.from).Select(spec.columns)
	if before > 0 {
		query = query.Where("r.id < ?", before)
	}
	rows, err := query.Order("r.id DESC").Limit(PageSize + 1).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	page.Columns, err = rows.Columns()
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		values := make([]any, len(page.Columns))
		dest := make([]any, len(values))
		for i := range values {
			dest[i] = &values[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		if len(page.Rows) == PageSize {
			page.NextCursor = page.Rows[PageSize-1][0]
			break
		}
		cells := make([]string, len(values))
		for i, v := range values {
			cells[i] = formatValue(v)
		}
		page.Rows = append(page.Rows, cells)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return page, nil
}
func formatValue(v any) string {
	switch value := v.(type) {
	case nil:
		return ""
	case []byte:
		return string(value)
	case string:
		return value
	case time.Time:
		return value.Format("2006-01-02 15:04:05") // Preserve stored wall time; do not shift historical DATETIME values.
	case int64:
		return strconv.FormatInt(value, 10)
	case uint64:
		return strconv.FormatUint(value, 10)
	case float64:
		return strconv.FormatFloat(value, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(value)
	default:
		return ""
	}
}
