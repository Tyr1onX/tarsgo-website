package database

import (
	"errors"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// V83 adds the documented long-term content backlog without changing existing works.
// One video has one production workflow and multiple publication targets; WeChat
// companion articles are independent text workflows. No dates are fabricated.
func migrateOperationsContentBacklogV83(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		assignees, err := operationsBacklogAssignees(tx)
		if err != nil {
			return err
		}
		type work struct {
			title, kind, series, next string
			platforms                 []string
		}
		works := []work{
			{"RMer 01｜李晟泽：跨学科学习的孤勇者", "video", "RMer", "拟采访，先确认本人意愿及拍摄计划；记录跨学科机械研发、困难和解决过程；完成B站长版、抖音精剪、视频号校园版，并在官网归档。", []string{"bilibili", "douyin", "wechat_video"}},
			{"RMer 02｜镇沈晖：从电控到全局的战队领航者", "video", "RMer", "拟采访，先确认本人意愿；围绕电控研发、机器人调试和跨组统筹组织拍摄；制作各平台侧重不同的版本并在官网归档。", []string{"bilibili", "douyin", "wechat_video"}},
			{"RMer 03｜吉荣昌：千次实验反复迭代的硬件达人", "video", "RMer", "拟采访，先确认本人意愿；拍摄硬件实验验证、电路调试和问题排查；制作长版与两种短版并在官网归档。", []string{"bilibili", "douyin", "wechat_video"}},
			{"RMer 04｜孙宇丹：细致耐心的财务能人", "video", "RMer", "拟采访，先确认本人意愿；记录财务核对、报销流程和幕后运营保障；制作长版与短版并在官网归档。", []string{"bilibili", "douyin", "wechat_video"}},
			{"RMer 01｜李晟泽人物故事（公众号图文）", "article", "RMer 图文", "与RMer 01视频共享采访素材，补充人物背景、工程细节、图文问答及视频链接；人物与事实仍需确认。", []string{"wechat"}},
			{"RMer 02｜镇沈晖人物故事（公众号图文）", "article", "RMer 图文", "与RMer 02视频共享素材，补充电控工作、团队协作和采访文字；人物与事实仍需确认。", []string{"wechat"}},
			{"RMer 03｜吉荣昌人物故事（公众号图文）", "article", "RMer 图文", "与RMer 03视频共享实验照片、硬件迭代细节及采访文字；人物与事实仍需确认。", []string{"wechat"}},
			{"RMer 04｜孙宇丹人物故事（公众号图文）", "article", "RMer 图文", "与RMer 04视频共享运营采访资料，展示财务与保障工作的幕后贡献；人物与事实仍需确认。", []string{"wechat"}},
			{"公众号历史活动补档｜2026年3月以来", "article", "历史活动补档", "持续核对活动台账与已发布推文，补齐尚未单独立项的活动；已发布的纳新回顾、低空实践、夏令营、三下乡及赛事赛程不重复投稿。", []string{"wechat"}},
			{"2026年9月21日｜南湖春屿机器人展示回顾", "article", "历史活动补档", "核实展示照片、参与人员和现场过程，形成独立活动纪实；先对照现有公众号推文排重。", []string{"wechat"}},
			{"2026年RMUC区域赛｜赛期纪实与团队回顾", "article", "历史活动补档", "已有赛前预告和比赛日赛程推文，需核实是否另有赛后总结；仅补缺失的比赛过程、协作和复盘，不杜撰成绩。", []string{"wechat"}},
			{"2026年11月2日｜像素MV《你》的幕后与传承", "article", "历史活动补档", "基于已发布的像素MV《你》收集创作过程、成员感受与截图，补成公众号文化纪实。", []string{"wechat"}},
			{"2026年11月｜电控硬件培训纪实", "article", "历史活动补档", "核实培训具体日期与内容，整理现场图片、学习重点及公开视频链接，作为公众号图文记录。", []string{"wechat"}},
			{"AI沙龙第一期｜活动纪实（待核实举办情况）", "article", "历史活动补档", "先核实第一期AI沙龙是否实际举办及日期，再依据签到、现场截图和成果制作纪实；未举办不得作为已发生活动发布。", []string{"wechat"}},
		}
		for _, entry := range works {
			var existing model.OperationsProgressItem
			err := tx.Where("title = ? AND kind = ?", entry.title, entry.kind).First(&existing).Error
			if err == nil {
				continue // Never overwrite an existing work or its publication/assignee records.
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			item := model.OperationsProgressItem{
				Title: entry.title, Kind: entry.kind, SeriesName: entry.series,
				Platforms: entry.platforms[0], Stage: "unconfirmed", Status: "active",
				Owner: "运营组", NextAction: entry.next,
			}
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
			for position, preset := range model.OperationsStepPresets(item.Kind) {
				var owner *uint64
				if preset.Key == "planning" {
					owner = assignees["马鹤铭"]
				} else if item.Kind == "video" {
					switch preset.Key {
					case "materials":
						owner = assignees["安博"]
					case "editing":
						owner = assignees["王钰涵"]
					}
				}
				if err := tx.Create(&model.OperationsProgressStep{
					ItemID: item.ID, Key: preset.Key, Title: preset.Title, Position: position,
					AssigneeID: owner, Status: "pending",
				}).Error; err != nil {
					return err
				}
			}
			for _, platform := range entry.platforms {
				note := "核对活动事实、现场图片和完整文字；公众号按事件纪实呈现"
				switch platform {
				case "bilibili":
					note = "3—5分钟完整版：人物成长、工程问题与团队协作"
				case "douyin":
					note = "精选高光短切：突出问题冲突、技术亮点与人物金句"
				case "wechat_video":
					note = "校园传播版：突出成长经历、团队氛围与人物故事"
				}
				if entry.series == "RMer 图文" {
					note = "人物配套图文：采访背景、研发照片、文字故事与视频入口"
				}
				if err := tx.Create(&model.OperationsPublication{
					ItemID: item.ID, Platform: platform, Status: "pending", VersionNote: note,
				}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// Resolve only unique, enabled real-name matches inside the active operations group.
func operationsBacklogAssignees(tx *gorm.DB) (map[string]*uint64, error) {
	matches := make(map[string]*uint64)
	var group model.UserGroup
	err := tx.Where("name = ? AND status = ?", "运营组", model.UserGroupStatusActive).Take(&group).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return matches, nil
	}
	if err != nil {
		return nil, err
	}
	for _, name := range []string{"马鹤铭", "安博", "王钰涵"} {
		var users []model.User
		if err := tx.Where("real_name = ? AND status = ?", name, model.UserStatusEnabled).Find(&users).Error; err != nil {
			return nil, err
		}
		if len(users) != 1 {
			continue
		}
		var count int64
		if err := tx.Model(&model.UserGroupMember{}).
			Where("group_id = ? AND user_id = ?", group.ID, users[0].ID).Count(&count).Error; err != nil {
			return nil, err
		}
		if count == 1 {
			id := users[0].ID
			matches[name] = &id
		}
	}
	return matches, nil
}
