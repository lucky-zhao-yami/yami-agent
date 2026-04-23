#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
代码对比生成器
对比当前分支与master分支的代码差异，将对比结果输出到git_logs目录
从 .code-workspace 文件读取项目列表
"""

import os
import json
import subprocess
import shutil
import glob
from pathlib import Path


def run_git_command(command: str, cwd: str) -> str:
    """执行git命令并返回输出"""
    result = subprocess.run(
        command,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding='utf-8'
    )
    return result.stdout.strip()


def get_current_branch(repo_path: str) -> str:
    """获取当前分支名"""
    return run_git_command("git branch --show-current", repo_path)


def get_commits_diff(repo_path: str) -> str:
    """获取相对于master的提交记录"""
    return run_git_command("git log master..HEAD --oneline --no-merges", repo_path)


def get_diff_stat(repo_path: str) -> str:
    """获取变更统计"""
    return run_git_command("git diff master --stat", repo_path)


def get_diff_files(repo_path: str) -> str:
    """获取变更文件列表"""
    return run_git_command("git diff master --name-status", repo_path)


def get_full_diff(repo_path: str) -> str:
    """获取完整差异"""
    return run_git_command("git diff master", repo_path)


def write_file(filepath: str, content: str):
    """写入文件（UTF-8编码）"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)


def find_workspace_file(workspace_path: str) -> str:
    """查找 .code-workspace 文件"""
    pattern = os.path.join(workspace_path, "*.code-workspace")
    files = glob.glob(pattern)
    return files[0] if files else None


def scan_git_in_directory(dir_path: str) -> list:
    """扫描目录下的 Git 项目（包括自身和子目录）"""
    projects = []
    
    # 检查目录自身是否是 Git 仓库
    if os.path.exists(os.path.join(dir_path, '.git')):
        projects.append({
            'name': os.path.basename(dir_path),
            'path': dir_path
        })
        return projects
    
    # 扫描子目录
    if os.path.isdir(dir_path):
        for item in os.listdir(dir_path):
            item_path = os.path.join(dir_path, item)
            git_path = os.path.join(item_path, '.git')
            if os.path.isdir(item_path) and os.path.exists(git_path):
                projects.append({
                    'name': item,
                    'path': item_path
                })
    
    return projects


def scan_projects_from_workspace(workspace_path: str) -> list:
    """从 .code-workspace 文件读取项目列表"""
    workspace_file = find_workspace_file(workspace_path)

    if not workspace_file:
        print(f"未找到 .code-workspace 文件，将扫描目录下的 Git 项目")
        return scan_git_in_directory(workspace_path)

    print(f"读取工作区文件: {workspace_file}")

    with open(workspace_file, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')
        clean_lines = [line for line in lines if not line.strip().startswith('//')]
        content = '\n'.join(clean_lines)
        workspace_config = json.loads(content)

    projects = []
    folders = workspace_config.get('folders', [])

    for folder in folders:
        folder_path = folder.get('path', '')
        if folder_path == '.':
            continue

        if not os.path.isabs(folder_path):
            full_path = os.path.normpath(os.path.join(workspace_path, folder_path))
        else:
            full_path = folder_path

        if not os.path.exists(full_path):
            print(f"  路径不存在，跳过: {full_path}")
            continue

        found = scan_git_in_directory(full_path)
        if found:
            print(f"  在 {folder_path} 下找到 {len(found)} 个 Git 项目")
            projects.extend(found)
        else:
            print(f"  在 {folder_path} 下未找到 Git 项目")

    return projects


def main(workspace_path: str, output_dir: str = None):
    if output_dir is None:
        output_dir = os.path.join(workspace_path, 'git_logs')

    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)
    print(f"输出目录: {output_dir}")

    projects = scan_projects_from_workspace(workspace_path)
    if not projects:
        print("未找到 Git 项目")
        return

    print(f"\n共找到 {len(projects)} 个 Git 项目")

    non_master_projects = []
    for project in projects:
        branch = get_current_branch(project['path'])
        project['branch'] = branch

        branch_file = os.path.join(output_dir, f"{project['name']}_branch.txt")
        write_file(branch_file, branch)

        if branch and branch != 'master' and branch and branch != 'main':
            non_master_projects.append(project)
            print(f"  {project['name']}: {branch} (非master)")
        else:
            print(f"  {project['name']}: {branch}")

    if not non_master_projects:
        print("\n所有仓库都在 master 分支，无需对比")
        return

    print(f"\n开始收集 {len(non_master_projects)} 个非 master 分支仓库的差异...")

    for project in non_master_projects:
        name = project['name']
        path = project['path']
        print(f"\n处理: {name} ({project['branch']})")

        commits = get_commits_diff(path)
        write_file(os.path.join(output_dir, f"{name}_commits.txt"), commits)

        diff_stat = get_diff_stat(path)
        write_file(os.path.join(output_dir, f"{name}_diff_stat.txt"), diff_stat)

        diff_files = get_diff_files(path)
        write_file(os.path.join(output_dir, f"{name}_diff_files.txt"), diff_files)

        full_diff = get_full_diff(path)
        write_file(os.path.join(output_dir, f"{name}_full_diff.txt"), full_diff)

    print("\n" + "=" * 50)
    print("代码对比完成！")
    print(f"输出目录: {output_dir}")
    print("=" * 50)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='代码对比生成器')
    parser.add_argument('workspace', help='工作区路径（包含 .code-workspace 文件的目录）')
    parser.add_argument('-o', '--output', help='输出目录（默认为工作区下的git_logs目录）')

    args = parser.parse_args()
    main(args.workspace, args.output)
